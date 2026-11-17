'use client';

// « Quitter le cours »: the room page's own way out, at the top of the page (plan
// online-classroom-tools.md, section 3, path (b)). While the participant is in the room
// it always asks first, in the main room or in a group: it reads nothing from Zoom, so
// it cannot be wrong about where the participant is. Both ways out are plain anchors, so
// leaving stays a full document navigation (A6).
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function RoomLeaveLink({ href, inRoom }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <a href={href} data-testid="room-leave" onClick={event => { if (inRoom) { event.preventDefault(); setAsking(true); } }}><LogOut /> Quitter le cours</a>
      </Button>
      <AlertDialog open={asking && inRoom} onOpenChange={setAsking}>
        <AlertDialogContent data-testid="room-leave-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter le cours ?</AlertDialogTitle>
            <AlertDialogDescription>Vous sortirez de la salle pour tout le cours.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="room-leave-stay">Rester dans le cours</AlertDialogCancel>
            <AlertDialogAction asChild><a href={href} data-testid="room-leave-yes">Quitter le cours</a></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
