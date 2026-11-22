'use client';

// The frame of the lesson room page (src/app/(admin)/online/room/[id]/page.jsx), shared
// with the room harness (scripts/lib/online-room-harness.mjs), so the real-Zoom scripts
// measure the room in the boxes the app gives it.
// In the room the frame is exactly as tall as the screen below the phone's top bar (the
// dynamic viewport where the browser has it, so a phone's address bar does not push the
// toolkit's footer off the screen; never less than 32rem, below which the page scrolls),
// and wider than the other states: the room (ZoomRoom.jsx) takes whatever height is left
// under the title and the hands. The toolkit sizes its video area, the whiteboard and a
// shared screen from that height; with only a minimum height it fell back to its own
// 300 px and squeezed the whiteboard into a strip (owner, Production, 2026-11-22).
import RoomLeaveLink from '@/components/online/RoomLeaveLink';

const IN_ROOM = 'max-w-standard gap-2 p-2 sm:gap-3 sm:p-3 [&>*]:shrink-0 h-[max(32rem,calc(100vh-3.5rem))] supports-[height:100dvh]:h-[max(32rem,calc(100dvh-3.5rem))] lg:h-[max(32rem,100vh)] lg:supports-[height:100dvh]:h-[max(32rem,100dvh)]';
const ELSEWHERE = 'max-w-4xl gap-4 p-3 sm:p-6 min-h-[calc(100vh-3.5rem)]';

export function RoomFrame({ inRoom, children }) {
  return (
    <div className={`mx-auto flex w-full flex-col ${inRoom ? IN_ROOM : ELSEWHERE}`} data-testid="room-frame">
      {children}
    </div>
  );
}

export function RoomHeader({ back, inRoom }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-lg font-bold sm:text-xl">Cours en ligne</h1>
      <RoomLeaveLink href={back} inRoom={inRoom} />
    </div>
  );
}
