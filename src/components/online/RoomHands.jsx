'use client';

// Raise hand « Lever la main » (plan online-classroom-tools.md, PR D; owner decisions of
// 2026-11-17). Drawn by ZoomRoom.jsx above the room, outside the toolkit, so it never
// covers a toolkit control, on a computer and on a phone. Nothing here talks to Zoom:
// the state comes from zoom-hands.mjs through the room session, and the actions go back
// the same way.
//  - A learner: one button, « Lever la main » / « Baisser la main », shown only in the
//    main room (hidden inside a group); a short line when the teacher lowered the hand.
//  - The teacher: « Mains levées (n) », the names in the order the hands went up,
//    « Baisser » for each and « Baisser toutes les mains ». A brief amber cue when a hand
//    goes up (at most once per 3 s), and a polite announcement for screen readers. No sound.
import { useEffect, useRef, useState } from 'react';
import { Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HAND_TEXT } from '@/lib/online/zoom-hands.mjs';

const NOTICE_MS = 8000;
const CUE_MS = 3000;

function LearnerHand({ up, loweredAt, onRaise, onLower }) {
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!loweredAt) { setNotice(false); return undefined; }
    setNotice(true);
    const timer = setTimeout(() => setNotice(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [loweredAt]);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid="room-hands">
      {notice && !up && <p role="status" className="text-sm text-muted-foreground" data-testid="room-hand-lowered">{HAND_TEXT.loweredByTeacher}</p>}
      <Button type="button" size="lg" variant={up ? 'default' : 'outline'} aria-pressed={up} data-testid="room-hand"
        className={`min-h-11 ${up ? 'bg-amber-500 text-white hover:bg-amber-600' : ''}`} onClick={up ? onLower : onRaise}>
        <Hand aria-hidden /> {up ? HAND_TEXT.lower : HAND_TEXT.raise}
      </Button>
    </div>
  );
}

function TeacherHands({ hands, cue, onLowerOf, onLowerAll }) {
  const [open, setOpen] = useState(true);
  const [flash, setFlash] = useState(false);
  const [said, setSaid] = useState('');
  const timer = useRef(null);
  const seen = useRef(cue?.count || 0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const count = cue?.count || 0;
    if (count <= seen.current) return;
    seen.current = count;
    setSaid(HAND_TEXT.raisedCue(cue.label));
    if (timer.current) return;
    setFlash(true);
    timer.current = setTimeout(() => { timer.current = null; setFlash(false); }, CUE_MS);
  }, [cue?.count, cue?.label]);
  return (
    <div data-testid="room-hands-panel" data-cue={flash ? 'on' : 'off'}
      className={`rounded-lg border p-2 text-sm transition-colors ${flash ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400' : 'bg-card'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded px-2 font-semibold" aria-expanded={open}
          onClick={() => setOpen(value => !value)} data-testid="room-hands-badge">
          <Hand className="h-4 w-4" aria-hidden /> {HAND_TEXT.panel(hands.length)}
        </button>
        {hands.length > 0 && <Button type="button" variant="outline" className="min-h-11" onClick={onLowerAll} data-testid="room-hands-lower-all">{HAND_TEXT.lowerAll}</Button>}
      </div>
      {open && hands.length > 0 && (
        <ol className="mt-1 max-h-40 space-y-1 overflow-y-auto" data-testid="room-hands-list">
          {hands.map((hand, index) => (
            <li key={hand.id} className="flex items-center justify-between gap-2 rounded px-2" data-testid="room-hands-item">
              <span><span className="text-muted-foreground">{index + 1}.</span> <span data-testid="room-hands-name">{hand.name}</span></span>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => onLowerOf(hand.id)}>{HAND_TEXT.lowerOne}</Button>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only" aria-live="polite" data-testid="room-hands-live">{said}</p>
    </div>
  );
}

export default function RoomHands({ state, onRaise, onLower, onLowerOf, onLowerAll }) {
  if (!state?.available) return null;
  return state.teacher
    ? <TeacherHands hands={state.hands || []} cue={state.cue} onLowerOf={onLowerOf} onLowerAll={onLowerAll} />
    : <LearnerHand up={state.up === true} loweredAt={state.loweredAt || 0} onRaise={onRaise} onLower={onLower} />;
}
