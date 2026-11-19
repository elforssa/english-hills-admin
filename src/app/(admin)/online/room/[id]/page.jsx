'use client';

// The one lesson room for every role (D6), phone-first. It asks the gated join route
// for a short-lived pass, mounts the provider's embedded room and watches its own pass
// (room-pass.mjs), leaving as soon as the participant no longer qualifies. This path
// carries its own security headers (camera, microphone and the Zoom hosts; OL-r6 A6),
// so every way in and out is a full document navigation: plain anchors in, and
// window.location.assign out (the toolkit's leave button, an ended lesson). « Quitter le
// cours » at the top is a plain anchor that asks first while the participant is in the
// room (RoomLeaveLink.jsx).
// One tab per lesson and person: a second tab in the same browser is told so and may
// take the room over, which makes the first tab leave before the second one joins.
// A retry first waits until the previous room has left Zoom and been destroyed, so a
// new pass never joins beside the old connection.
// Newest connection wins (plan online-room-reliability.md, reliability PR): once the room
// reports the participant inside, the page confirms its pass, which supersedes the same
// person's older passes for the lesson; the older page leaves at its next check (every
// 10 s, or at once on the newer device's marker) and shows « Utiliser cet appareil »,
// with no automatic retry. A parent who takes a child's place is told once. A removal
// by the teacher and the end of the lesson for all have their own texts.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';
import { Video, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RoomLeaveLink from '@/components/online/RoomLeaveLink';
import { useAuth } from '@/context/AuthContext';
import { onlinePost, onlineRpc, casablancaTime } from '@/lib/online/queries';
import { ONLINE_REASON_TEXT, onlineErrorText } from '@/lib/online/reasons.mjs';
import { roomErrorFor, passExpired } from '@/lib/online/zoom-room-errors.mjs';
import { roomSettled } from '@/lib/online/zoom-room-session.mjs';
import { createPassWatcher, closedOutcome, ROOM_PASS_TEXT } from '@/lib/online/room-pass.mjs';
import { createTabGuard, roomGuardKey } from '@/lib/online/room-tab-guard.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACK = { student: '/student-portal/online', parent: '/parent-portal/online', teacher: '/teacher-portal/online' };
const ZoomRoom = dynamic(() => import('@/components/online/ZoomRoom'), { ssr: false,
  loading: () => <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Chargement de la salle…</p> });

function leaveRoom(href) {
  window.location.assign(href);
}

function FakeRoom({ embed }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-6 text-center">
      <Video className="h-10 w-10 text-sky-700" aria-hidden />
      <p className="text-lg font-semibold text-sky-900">Salle de cours (fournisseur de test)</p>
      <p className="text-sm text-sky-900">Connecté en tant que <strong>{embed.displayName}</strong> · {embed.role === 'host' ? 'enseignant' : 'participant'}</p>
      <p className="text-xs text-sky-800">Accès valable jusqu’à {casablancaTime(embed.expiresAt)} (heure de Casablanca).</p>
    </div>
  );
}

function Room() {
  const { id } = useParams();
  const search = useSearchParams();
  const student = search.get('student');
  const { role, user } = useAuth();
  const [state, setState] = useState({ phase: 'checking' });
  const [tookOver, setTookOver] = useState(null);
  const guard = useRef(null);
  const watcher = useRef(null);
  const roomLink = useRef(null);
  const passRef = useRef(null);
  // Set when another tab takes the room over; a join in flight must then stop.
  const displaced = useRef(false);
  const valid = UUID.test(id || '') && (!student || UUID.test(student));
  const back = BACK[role] || '/online';

  const join = useCallback(async () => {
    if (displaced.current) return;
    setState({ phase: 'joining' });
    setTookOver(null);
    // Never ask for a new pass while an earlier room is still leaving Zoom.
    await roomSettled();
    if (displaced.current) return;
    const result = await onlinePost('/api/online/join', { lesson: id, ...(student ? { student } : {}) });
    // A takeover during the request: the late pass must not open the room in this tab.
    if (displaced.current) return;
    if (result.ok && result.body?.pass) { passRef.current = result.body.pass; setState({ phase: 'in_room', ...result.body }); }
    else if (result.body?.reason === 'superseded') setState({ phase: 'superseded' });
    else if (result.ok) setState({ phase: 'refused', reason: 'provider_error' });
    else {
      let opensAt = null;
      if (result.body?.reason === 'window_closed') {
        opensAt = await onlineRpc('online_check_join', { p_lesson: id, p_student: student || null })
          .then(check => check?.opens_at).catch(() => null);
        if (displaced.current) return;
      }
      setState({ phase: 'refused', reason: result.body?.reason, opensAt });
    }
  }, [id, student]);

  // The tab guard comes first: a second tab does not even ask for a pass.
  const person = student || user?.id || null;
  useEffect(() => {
    if (!valid) return undefined;
    let live = true;
    displaced.current = false;
    const tab = createTabGuard({ key: roomGuardKey(id, person), onTakeover: () => { if (live) { displaced.current = true; setState({ phase: 'displaced' }); } } });
    guard.current = tab;
    tab.acquire().then(result => { if (live) { if (result === 'busy') setState({ phase: 'other_tab' }); else join(); } });
    return () => { live = false; guard.current = null; tab.close(); };
  }, [valid, id, person, join]);
  const takeThisTab = useCallback(async () => {
    setState({ phase: 'checking' });
    const result = await guard.current?.takeOver();
    if (result === 'busy') setState({ phase: 'other_tab', stuck: true }); else join();
  }, [join]);
  // Another tab took the room over: free the lock once this tab has left Zoom.
  useEffect(() => {
    if (state.phase !== 'displaced') return;
    Promise.resolve().then(roomSettled).then(() => guard.current?.release());
  }, [state.phase]);

  // The pass in the room: confirmed once the room reports the participant inside, then
  // checked every 10 s. Leave when a newer device took over, the lesson is cancelled,
  // the course closes, a guest is removed, consent is revoked or the window ends.
  const pass = state.phase === 'in_room' ? state.pass : null;
  const fakeRoom = state.phase === 'in_room' && state.provider === 'fake';
  const label = state.phase === 'in_room' ? state.display_label : null;
  useEffect(() => {
    if (!pass) return undefined;
    const watch = createPassWatcher({
      pass, rpc: onlineRpc,
      onOutcome: outcome => setState(outcome.kind === 'superseded' ? { phase: 'superseded' } : { phase: 'left', reason: outcome.reason }),
      onTookOver: () => setTookOver(label || ''),
      onSupersededOthers: () => roomLink.current?.announceNewer(),
    });
    watcher.current = watch;
    // The test provider has no room to enter: the page is in as soon as it shows.
    if (fakeRoom) watch.joined();
    return () => { if (watcher.current === watch) watcher.current = null; watch.stop(); };
  }, [pass, fakeRoom, label]);
  const onJoined = useCallback(() => watcher.current?.joined(), []);
  const onNewer = useCallback(() => watcher.current?.checkNow(), []);

  // The room has already left Zoom and been destroyed when this is called.
  const onLeft = useCallback(async detail => {
    const outcome = await closedOutcome(detail?.closed, () => onlineRpc('online_check_pass', { p_jti: passRef.current }));
    if (outcome.kind === 'portal') leaveRoom(back);
    else if (outcome.kind === 'left') setState({ phase: 'left', reason: outcome.reason });
    else setState({ phase: outcome.kind });
  }, [back]);
  // The room has already left Zoom and been destroyed when this is called.
  const onError = useCallback(detail => setState(previous => ({ phase: 'refused', reason: 'provider_error',
    room: roomErrorFor({ ...detail, passExpired: passExpired(previous.embed) }) })), []);
  // An automatic leave shows its reason for a moment, then returns to the portal by a
  // full document navigation, so the room-only headers never outlive the room (A6).
  useEffect(() => {
    if (state.phase !== 'left') return undefined;
    const timer = setTimeout(() => leaveRoom(back), 6000);
    return () => clearTimeout(timer);
  }, [state.phase, back]);
  const message = state.room?.text || (state.reason ? (ONLINE_REASON_TEXT[state.reason] || onlineErrorText({ reason: state.reason })) : null);
  const canRetry = state.room ? state.room.retry : ['window_closed', 'provider_error', 'pass_invalid'].includes(state.reason);
  const room = state.phase === 'in_room' && (
    state.provider === 'fake' && state.embed?.kind === 'fake' ? <FakeRoom embed={state.embed} />
      : state.provider === 'zoom-video' && state.embed?.kind === 'zoom-video' ? <ZoomRoom embed={state.embed} onLeft={onLeft} onError={onError}
        onJoined={onJoined} onNewer={onNewer} link={roomLink} />
        : <p className="rounded-lg border bg-card p-6 text-sm">{ONLINE_REASON_TEXT.provider_invalid}</p>);
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-4xl flex-col gap-4 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold sm:text-xl">Cours en ligne</h1>
        <RoomLeaveLink href={back} inRoom={state.phase === 'in_room'} />
      </div>
      {!valid && <p className="rounded-lg border bg-card p-6 text-sm">{ONLINE_REASON_TEXT.not_found}</p>}
      {valid && (state.phase === 'joining' || state.phase === 'checking') && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Ouverture de la salle…</p>}
      {state.phase === 'other_tab' && (
        <div className="space-y-3 rounded-lg border bg-card p-6" data-testid="room-other-tab">
          <p className="text-sm">Vous êtes déjà connecté à ce cours dans un autre onglet.</p>
          {state.stuck && <p className="text-sm text-muted-foreground">L’autre onglet n’a pas répondu. Fermez-le, puis réessayez.</p>}
          <Button onClick={takeThisTab} size="lg" className="min-h-11">Utiliser cet onglet</Button>
        </div>
      )}
      {state.phase === 'displaced' && (
        <p className="rounded-lg border bg-card p-6 text-sm" data-testid="room-displaced">Ce cours est maintenant ouvert dans un autre onglet. Vous pouvez fermer celui-ci.</p>
      )}
      {state.phase === 'superseded' && (
        <div className="space-y-3 rounded-lg border bg-card p-6" data-testid="room-superseded">
          <p className="text-sm">{ROOM_PASS_TEXT.superseded}</p>
          <Button onClick={join} size="lg" className="min-h-11">{ROOM_PASS_TEXT.useThisDevice}</Button>
        </div>
      )}
      {state.phase === 'removed' && (
        <div className="space-y-3 rounded-lg border bg-card p-6" data-testid="room-removed">
          <p className="text-sm">{ROOM_PASS_TEXT.removed}</p>
          <Button onClick={() => leaveRoom(back)} size="lg" className="min-h-11">{ROOM_PASS_TEXT.quit}</Button>
        </div>
      )}
      {state.phase === 'ended' && (
        <div className="space-y-3 rounded-lg border bg-card p-6" data-testid="room-ended">
          <p className="text-sm">{ROOM_PASS_TEXT.ended}</p>
          <Button onClick={() => leaveRoom(back)} size="lg" className="min-h-11">{ROOM_PASS_TEXT.quit}</Button>
        </div>
      )}
      {state.phase === 'in_room' && tookOver !== null && (
        <p className="rounded-lg border bg-card p-3 text-sm" role="status" data-testid="room-took-over">{ROOM_PASS_TEXT.tookOver(tookOver)}</p>
      )}
      {state.phase === 'in_room' && state.provider === 'zoom-video' && (
        <p className="rounded-lg border bg-card p-3 text-sm sm:hidden" data-testid="room-audio-hint">Touchez l’icône casque pour activer le son, puis le micro et la caméra.</p>
      )}
      {room}
      {(state.phase === 'refused' || state.phase === 'left') && (
        <div className="space-y-3 rounded-lg border bg-card p-6">
          <p className="text-sm">{state.phase === 'left' ? 'Vous avez quitté la salle. ' : ''}{message}</p>
          {state.reason === 'window_closed' && state.opensAt && <p className="text-sm text-muted-foreground">La salle ouvre à {casablancaTime(state.opensAt)} (heure de Casablanca).</p>}
          {canRetry && <Button onClick={join} size="lg" className="min-h-11"><RefreshCw /> Réessayer</Button>}
        </div>
      )}
    </div>
  );
}

export default function OnlineRoomPage() {
  return <Suspense fallback={null}><Room /></Suspense>;
}
