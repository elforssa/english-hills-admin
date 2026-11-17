'use client';

// The online teacher's space (D5): own lessons only, through projections that carry no
// learner contact data. Cancelling or moving a lesson is the office's job (Q5 = A).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Video, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnlineRead, civilDate, joinWindowState, casablancaTime } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';
import { ONLINE_LESSON_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = { scheduled: 'Prévu', cancelled: 'Annulé', completed: 'Fait' };

export default function TeacherOnlineLessons() {
  const lessons = useOnlineRead('online_list_my_lessons', {}, { roles: ['teacher'], refetchInterval: 60000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mes cours en ligne</h1>
        <Link href="/teacher-portal" className="text-sm text-primary hover:underline">Espace enseignant</Link>
      </div>
      {lessons.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {lessons.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(lessons.error)}</p>}
      {lessons.data?.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Aucun cours en ligne sur la période.</p>}
      <ul className="space-y-3">
        {(lessons.data || []).map(lesson => {
          const room = lesson.i_am_host ? joinWindowState({ ...lesson, join_opens_at: lesson.host_opens_at }, now) : 'closed';
          return (
            <li key={lesson.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{lesson.course_name}</p>
                  <p className="text-sm text-muted-foreground">{civilDate(lesson.local_date)} · {lesson.local_time}–{lesson.local_end_time}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded px-2 py-0.5 ${ONLINE_LESSON_STATUS_COLORS[lesson.status]}`}>{STATUS[lesson.status]}</span>
                    {lesson.is_substitute && <span className="rounded bg-violet-50 px-2 py-0.5 text-violet-800">{lesson.i_am_host ? 'Remplacement' : 'Remplacé'}</span>}
                    {lesson.report_present && <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">Compte rendu saisi</span>}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  {lesson.i_am_host && lesson.status !== 'cancelled' && (room === 'open'
                    ? <Button asChild className="min-h-11"><a href={`/online/room/${lesson.id}`} data-room-entry><Video /> Ouvrir la salle</a></Button>
                    : <Button className="min-h-11" disabled><Video /> {room === 'upcoming' ? `Salle à ${casablancaTime(lesson.host_opens_at)}` : 'Salle fermée'}</Button>)}
                  {lesson.roster_open && <Button asChild variant="outline" className="min-h-11"><Link href={`/teacher-portal/online/${lesson.id}`}><ClipboardCheck /> Présences</Link></Button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {/* Guide de la salle (plan online-classroom-tools.md, section 6): static text on the page a
          teacher opens before every lesson. Whiteboard: PR A. Groups and the rest: PR B. The timer,
          the forgotten assignment and the phone's English leave window are what the real-Zoom runs
          of 2026-11-16 showed about the toolkit; « Zoom Canvas » is the owner's decision of that day; phones in groups is D12 (2026-11-17).
          Renaming groups and retyping the minutes: notes N8 and N6 of the #195 review (classroom polish).
          Raised hands: PR D, owner decisions of 2026-11-17. */}
      <details className="mt-6 rounded-xl border bg-card p-4 text-sm" data-testid="room-guide">
        <summary className="cursor-pointer font-semibold">Guide de la salle</summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p><span className="font-medium text-foreground">Tableau blanc.</span> Sur ordinateur, ouvrez-le avec le bouton « Ouvrir le tableau blanc » de la salle. Les apprenants sur ordinateur peuvent écrire avec vous ; sur téléphone, sur tablette ou sur un ordinateur peu puissant, ils le voient en lecture seule.</p>
          <p>Le tableau blanc ne peut pas être rouvert après sa fermeture : choisissez « Exporter et fermer » pour garder une copie PDF. Seul l’enseignant peut l’exporter.</p>
          <p>N’utilisez pas l’outil « Zoom Canvas » du tableau blanc : la salle le bloque et il ne fonctionne pas.</p>
          <p><span className="font-medium text-foreground">Groupes.</span> Sur ordinateur, le bouton aux quatre carrés, en bas de la salle, ouvre la fenêtre « Groupes » : créez les groupes, puis répartissez les apprenants (automatiquement, à la main, ou en les laissant choisir). Donnez un nom à chaque groupe avec « Renommer » : l’invitation que reçoit l’apprenant affiche ce nom, sinon elle dit « Subsession 1 ».</p>
          <p data-testid="room-guide-timer"><span className="font-medium text-foreground">Toujours un minuteur.</span> Dans « Paramètres », cochez « Fermer automatiquement les groupes après » et saisissez vous-même la durée en minutes (le nombre affiché au départ, 1800, correspond à 30 minutes). Après une première ouverture, le champ peut afficher la durée en secondes : retapez toujours le nombre de minutes avant d’ouvrir. À la fin du temps, tout le monde revient dans la salle principale, même si votre page s’est fermée entre-temps.</p>
          <p>Ouvrez les groupes sans attendre après la répartition : la fenêtre peut oublier une répartition faite avant l’ouverture. Si, après « Ouvrir tous les groupes », un apprenant est encore dans « Participants sans groupe », cliquez sur « Répartir » à côté de son groupe : il reçoit l’invitation.</p>
          <p><span className="font-medium text-foreground">Passez dans chaque groupe.</span> « Rejoindre », à côté d’un groupe, vous y emmène ; pour revenir, bouton rouge puis « Revenir à la salle principale ». « Message à tous » envoie un texte à tous les groupes. Un apprenant peut « Demander de l’aide » : vous recevez sa demande et pouvez rejoindre son groupe. « Fermer tous les groupes » ramène tout le monde tout de suite.</p>
          <p><span className="font-medium text-foreground">Apprenants sur téléphone.</span> Demandez qui est sur téléphone (la salle ne l’indique pas) : ils peuvent être répartis dans un groupe comme les autres. Sur téléphone, dans un groupe, le bouton rouge ouvre une fenêtre en anglais : « To Main » ramène à la salle principale, « Leave » fait quitter le cours. Dites-le-leur une fois : « pour revenir, touchez To Main, jamais Leave ». Un apprenant sorti par erreur revient avec « Rejoindre le cours ». Si un groupe ne fonctionne pas pour l’un d’eux, laissez-le sans groupe : il reste avec vous dans la salle principale.</p>
          <p>Le tableau blanc n’existe pas dans les groupes : exportez-le avant de les ouvrir. Après une coupure, « Réessayer » ramène un apprenant dans la salle principale : répartissez-le de nouveau dans son groupe.</p>
          <p data-testid="room-guide-hands"><span className="font-medium text-foreground">Mains levées.</span> Les apprenants ont un bouton « Lever la main » au-dessus de la salle, sur ordinateur comme sur téléphone. Vous voyez « Mains levées (…) » au-dessus de la salle, avec les noms dans l’ordre où les mains se sont levées ; le cadre devient orange un instant quand une main se lève, sans aucun son. « Baisser » baisse une main, « Baisser toutes les mains » les baisse toutes.</p>
          <p>Une main se baisse toute seule quand l’apprenant quitte le cours, part dans un groupe ou se reconnecte. Dans un groupe, le bouton n’existe pas : les mains servent dans la salle principale. Si vous rechargez la page ou revenez d’un groupe, la liste revient en quelques secondes, dans le même ordre.</p>
          <p><span className="font-medium text-foreground">À savoir aussi.</span> Pour faire écouter un document sonore, partagez un onglet de Chrome et cochez la case du son de l’onglet. Ne nommez jamais un apprenant animateur ou co-animateur. « Quitter le cours », en haut de la page, demande toujours une confirmation.</p>
        </div>
      </details>
      <p className="mt-6 text-xs text-muted-foreground">Pour annuler ou déplacer un cours, ou pour inviter un apprenant, contactez l’accueil.</p>
    </div>
  );
}
