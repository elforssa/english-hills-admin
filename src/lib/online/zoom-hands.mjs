// Raise hand « Lever la main » for the room (plan online-classroom-tools.md, PR D design
// addendum, owner decisions of 2026-11-17). The toolkit has no raise hand; the room
// carries it on Zoom's command channel, like the whiteboard markers, without React so it
// can be tested with a fake client.
//
// Facts (probe with Zoom, installed Chrome, development key, 2026-11-17):
//   - `getCommandClient().send(text, userId)` reaches only that participant, but the
//     receiver's payload has no `receiverId`: it cannot tell a message sent to it from one
//     sent to everybody. `senderId` is set by Zoom, as a string;
//   - Zoom also raises a copy of some messages without `senderId`: never believed here;
//   - a learner who moves into a group reaches the main room as `user-removed` and is no
//     longer in `getAllUser()`; a reload is `user-removed` then a new id;
//   - when the teacher visits a group and comes back, the teacher gets a new id, the
//     main-room learners keep theirs, and every message sent in the main room meanwhile
//     is lost for the teacher: the teacher's page forgets its list and asks again;
//   - `getSubsessionClient().getUserStatus()` is 'in room' inside a group, anything else
//     (initial, invited, main session) in the main room.
//
// Markers (exact texts; anything else with the prefix is ignored):
//   eh-hand:raise              a learner, for themself, to everybody
//   eh-hand:lower-self         a learner, for themself, to everybody
//   eh-hand:ask                a teacher's page, to everybody (join, reconnection,
//                              command channel connected)
//   eh-hand:raised:<seconds>   a learner whose hand is up answers an ask (at most once
//                              per `answerMs`); the seconds since the hand went up, so
//                              the page that asked rebuilds the order
//   eh-hand:lower              the host or a manager, to one learner
//   eh-hand:lower-all          the host or a manager, to everybody
// « raise », « lower-self » and « raised » act only on the sender's own hand (Zoom's
// sender id); « lower » and « lower-all » are believed only from the host or a manager,
// as Zoom lists them. The markers carry nothing about a person. No attendance, no
// database. The trace says totals and states only, never a name or an id.
//
// Review notes of #199, applied with the reliability PR:
//   - N2: a learner page whose participant Zoom lists as the host or a manager (an
//     observer or a learner made co-host) gets no button: `available` is false for it, and
//     a hand that was up goes down (« lower-self » is sent). Zoom's `user-updated` is read
//     again for that;
//   - N3: a hand that was up when the connection dropped, and a « lower-self » that Zoom
//     refused, are owed: « lower-self » is sent again once the page is back in the main
//     room (connected, or its command channel connected) until Zoom takes it, so the
//     teacher's list never keeps a hand the learner no longer shows;
//   - N5: a hand the teacher's page rebuilds from an answer to its question (after a
//     reload of the teacher's page or a return from a group) joins the list without the
//     amber cue or the screen-reader line; only a new « raise » gives them.

export const HAND_PREFIX = 'eh-hand:';
export const HAND_SIGNAL = Object.freeze({ raise: 'eh-hand:raise', lowerSelf: 'eh-hand:lower-self', ask: 'eh-hand:ask', raised: 'eh-hand:raised:', lower: 'eh-hand:lower', lowerAll: 'eh-hand:lower-all' });
export const MAX_HANDS = 100;
export const MAX_WAITING = 64;
export const MAX_AGE_SECONDS = 10800;
export const ANSWER_WINDOW_MS = 10000;

export const HAND_TEXT = Object.freeze({
  raise: 'Lever la main',
  lower: 'Baisser la main',
  panel: count => `Mains levées (${count})`,
  lowerOne: 'Baisser',
  lowerAll: 'Baisser toutes les mains',
  loweredByTeacher: 'Votre main a été baissée par l’enseignant.',
  raisedCue: label => `${label} lève la main`,
  someone: 'Un participant',
});

const KIND = { [HAND_SIGNAL.raise]: 'raise', [HAND_SIGNAL.lowerSelf]: 'lowerSelf', [HAND_SIGNAL.ask]: 'ask', [HAND_SIGNAL.lower]: 'lower', [HAND_SIGNAL.lowerAll]: 'lowerAll' };
const RAISED = /^eh-hand:raised:(\d{1,5})$/;
const SENDER = /^\d{1,15}$/;

// A command-channel payload as { kind, from, age? }, or null when it is not one of ours
// or has no sender id Zoom could have set.
export function parseHandMessage(payload) {
  const text = payload?.text;
  if (typeof text !== 'string' || !text.startsWith(HAND_PREFIX)) return null;
  const from = payload?.senderId === undefined || payload?.senderId === null ? '' : String(payload.senderId);
  if (!SENDER.test(from)) return null;
  if (KIND[text]) return { kind: KIND[text], from };
  const raised = text.match(RAISED);
  return raised ? { kind: 'raised', from, age: Math.min(Number(raised[1]), MAX_AGE_SECONDS) } : null;
}

// One side of raise hand: `teacher` true for the host's page (the list), false for a
// learner's (the button). `onChange` gets the state to draw:
//   teacher: { teacher: true, available, hands: [{ id, name }], cue: { count, label } }
//   learner: { teacher: false, available, up, loweredAt }
export function createHands({ teacher, win, log = () => {}, onChange = () => {}, answerMs = 2000, now = () => Date.now() }) {
  const s = { stopped: false, connected: false, group: false, list: [], waiting: new Map(), askedAt: -Infinity, cue: { count: 0, label: '' },
    up: false, raisedAt: 0, answered: -Infinity, answer: null, loweredAt: 0, traced: 0, owesLower: false, privileged: false };

  const client = () => win?.zmClient;
  const users = () => { try { return client()?.getAllUser?.() || null; } catch { return null; } };
  const lookup = id => users()?.find(user => String(user.userId) === String(id)) || null;
  const trusted = id => { const user = lookup(id); return user ? !!(user.isHost || user.isManager) : null; };
  const selfId = () => { try { return String(client()?.getCurrentUserInfo?.()?.userId ?? ''); } catch { return ''; } };
  // Inside a group, or on the way in: 'in room' or 'joining'. 'leaving' is on the way back.
  const inGroup = () => { try { return ['in room', 'joining'].includes(client()?.getSubsessionClient?.()?.getUserStatus?.()); } catch { return false; } };
  // Resolves true when Zoom took the message; a refusal (rejected, or Zoom's failure object) is false.
  const send = (text, target) => {
    try {
      const channel = client()?.getCommandClient?.();
      if (typeof channel?.send !== 'function') return Promise.resolve(false);
      return Promise.resolve(target === undefined ? channel.send(text) : channel.send(text, target))
        .then(result => !(result instanceof Error) && !(result && typeof result === 'object' && 'reason' in result && !('text' in result)), () => false);
    } catch { return Promise.resolve(false); }
  };
  // N2: Zoom lists this participant as the host or a manager (not for the teacher's list).
  const privileged = () => { if (teacher) return false; const self = lookup(selfId()); return !!(self && (self.isHost || self.isManager)); };
  const available = () => s.connected && !s.group && !(teacher ? false : s.privileged);
  // Zoom may update the participant's group state a moment after `Connected`: it is read
  // again when the command channel connects and when participants are added (both
  // follow every move), and once more before a hand goes up.
  const regroup = () => { const group = s.connected && inGroup(); if (group === s.group) return false; s.group = group; if (group && !teacher) { stopAnswer(); down('move'); } return true; };
  const emit = () => {
    if (s.stopped) return;
    try {
      onChange(teacher ? { teacher: true, available: available(), hands: s.list.map(({ id, name }) => ({ id, name })), cue: { ...s.cue } }
        : { teacher: false, available: available(), up: s.up, loweredAt: s.loweredAt });
    } catch { /* drawing never breaks the room */ }
  };

  // ---- Teacher: the list ----
  const total = () => { if (s.list.length !== s.traced) { s.traced = s.list.length; log('hands', { total: s.list.length }); } };
  // `cue` false for a hand rebuilt from an answer (N5): no amber cue, no announcement.
  const add = (id, at, cue = true) => {
    if (s.list.some(hand => hand.id === id)) return;
    const user = lookup(id);
    if (!user) { if (!s.waiting.has(id) && s.waiting.size < MAX_WAITING) s.waiting.set(id, { at, cue }); return; }
    if (user.isHost || user.isManager || id === selfId() || s.list.length >= MAX_HANDS) return;
    const name = String(user.displayName || '').trim() || HAND_TEXT.someone;
    const index = s.list.findIndex(hand => hand.at > at);
    s.list.splice(index < 0 ? s.list.length : index, 0, { id, name, at });
    if (cue) s.cue = { count: s.cue.count + 1, label: name };
    total(); emit();
  };
  const remove = id => {
    s.waiting.delete(id);
    const before = s.list.length;
    s.list = s.list.filter(hand => hand.id !== id);
    if (s.list.length !== before) { total(); emit(); }
  };
  const forget = () => { s.waiting.clear(); if (s.list.length) { s.list = []; total(); } };
  const ask = () => { s.askedAt = now(); send(HAND_SIGNAL.ask); };
  const teacherMessage = ({ kind, from, age }) => {
    if (kind === 'raise') add(from, now());
    else if (kind === 'raised') add(from, now() - s.askedAt <= ANSWER_WINDOW_MS ? now() - age * 1000 : now(), false);
    else if (kind === 'lowerSelf') remove(from);
    else if (kind === 'lowerAll' && trusted(from) === true) { forget(); emit(); }
  };

  // ---- Learner: the button ----
  const down = by => {
    if (!s.up) return;
    s.up = false;
    if (by === 'teacher') s.loweredAt = now();
    log('hand', { state: 'down', by });
    emit();
  };
  const stopAnswer = () => { if (s.answer) { clearTimeout(s.answer); s.answer = null; } };
  const sendAnswer = () => {
    s.answer = null;
    if (s.stopped || !s.up || !available()) return;
    s.answered = now();
    send(`${HAND_SIGNAL.raised}${Math.min(Math.max(0, Math.floor((now() - s.raisedAt) / 1000)), MAX_AGE_SECONDS)}`);
  };
  // At most one answer per `answerMs`: a burst of questions gets one answer at once and
  // one more when the interval is over (the whiteboard's rule).
  const answer = () => {
    if (!s.up || s.answer) return;
    const wait = s.answered + answerMs - now();
    if (wait <= 0) sendAnswer(); else s.answer = setTimeout(sendAnswer, wait);
  };
  // N3: « lower-self » until Zoom takes it; sent only from the main room, where the
  // teacher's list is.
  const lowerSelf = () => {
    s.owesLower = true;
    if (s.up || !available()) return;
    send(HAND_SIGNAL.lowerSelf).then(ok => { if (ok && !s.up) s.owesLower = false; });
  };
  const payDebt = () => { if (!teacher && s.owesLower && !s.up && available()) lowerSelf(); };
  // N2: re-read whether Zoom lists this participant as the host or a manager.
  const reprivilege = () => {
    if (teacher) return false;
    const now_ = s.connected && privileged();
    if (now_ === s.privileged) return false;
    s.privileged = now_;
    if (now_ && s.up) { stopAnswer(); down('role'); s.owesLower = true; send(HAND_SIGNAL.lowerSelf).then(ok => { if (ok && !s.up) s.owesLower = false; }); }
    return true;
  };
  const learnerMessage = ({ kind, from }) => {
    if (kind === 'ask') answer();
    else if ((kind === 'lower' || kind === 'lowerAll') && s.up && trusted(from) === true) {
      down('teacher');
      if (kind === 'lower') lowerSelf();
    }
  };

  return {
    message(payload) {
      if (s.stopped) return;
      const parsed = parseHandMessage(payload);
      if (!parsed || parsed.from === selfId()) return;
      if (teacher) teacherMessage(parsed); else learnerMessage(parsed);
    },
    connected() {
      if (s.stopped) return;
      s.connected = true; s.group = inGroup();
      reprivilege();
      if (teacher && !s.group) ask();
      payDebt();
      emit();
    },
    // Any reconnection (a move into a group or back, a network drop): the learner's hand
    // goes down and its « lower-self » is owed (N3); the teacher's page forgets its list,
    // which it rebuilds by asking.
    reconnecting() {
      if (s.stopped) return;
      s.connected = false;
      if (teacher) forget(); else { stopAnswer(); if (s.up) s.owesLower = true; down('move'); }
      emit();
    },
    closed() {
      if (s.stopped) return;
      s.connected = false;
      if (teacher) forget(); else { stopAnswer(); down('leave'); }
      emit();
    },
    commandReady() {
      if (s.stopped) return;
      if (regroup() | reprivilege()) emit();
      if (teacher && available()) ask();
      payDebt();
    },
    added() {
      if (s.stopped) return;
      if (regroup() | reprivilege()) emit();
      if (!teacher) { payDebt(); return; }
      for (const [id, { at, cue }] of [...s.waiting]) {
        if (!lookup(id)) continue;
        s.waiting.delete(id);
        add(id, at, cue);
      }
    },
    // Zoom's `user-updated`: a role may have changed (N2).
    updated() {
      if (s.stopped || teacher) return;
      if (reprivilege()) emit();
      payDebt();
    },
    removed(list) {
      if (s.stopped || !teacher) return;
      for (const user of Array.isArray(list) ? list : [list]) if (user?.userId !== undefined) remove(String(user.userId));
    },
    raise() {
      if (s.stopped || teacher || s.up) return false;
      if (regroup() | reprivilege()) emit();
      if (!available()) return false;
      s.up = true; s.raisedAt = now(); s.loweredAt = 0; s.owesLower = false;
      const raisedAt = s.raisedAt;
      log('hand', { state: 'up', by: 'self' });
      emit();
      send(HAND_SIGNAL.raise).then(ok => { if (!ok && s.up && s.raisedAt === raisedAt) down('failed'); });
      return true;
    },
    lower() {
      if (s.stopped || teacher || !s.up) return false;
      stopAnswer();
      down('self');
      lowerSelf();
      return true;
    },
    lowerOf(id) {
      if (s.stopped || !teacher) return false;
      const key = String(id);
      if (!s.list.some(hand => hand.id === key)) return false;
      remove(key);
      send(HAND_SIGNAL.lower, Number(key));
      return true;
    },
    lowerAll() {
      if (s.stopped || !teacher) return false;
      forget(); emit();
      send(HAND_SIGNAL.lowerAll);
      return true;
    },
    stop() { s.stopped = true; stopAnswer(); },
  };
}
