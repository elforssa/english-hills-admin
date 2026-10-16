import './helpdesk.css';
import GuideContent from './GuideContent';
import HelpdeskNav from './HelpdeskNav';
import ImageZoom from './ImageZoom';

export const metadata = {
  title: 'Guide Accueil — English Hills',
  description: 'Guide d’utilisation de l’espace Accueil : prospects (CRM), apprenants, paiements, groupes, présences et enseignants.',
};

// Static, read-only help for staff. Access is decided by roleAccess.mjs (canViewHelp) in the middleware,
// ProtectedRoute and the sidebar; the page itself loads no data.
export default function HelpdeskPage() {
  return (
    <div className="hd-scroll">
      <div className="hd">
        <div className="shell" lang="fr">
          <HelpdeskNav />
          <ImageZoom>
            <article>
              <GuideContent />
            </article>
          </ImageZoom>
        </div>
      </div>
    </div>
  );
}
