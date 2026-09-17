import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Politique de confidentialité — English Hills',
  description: 'Politique de confidentialité et traitement des données personnelles d\'English Hills Language Center.',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: '#f0f4fa' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Link
            href="/inscription"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={14} /> Retour
          </Link>
        </div>

        <div className="text-center mb-8">
          <Image src="/eh-logo.png" alt="English Hills" width={140} height={56} priority className="h-14 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand)' }}>Politique de confidentialité</h1>
          <p className="text-gray-500 text-sm mt-1">Informations sur le traitement des données</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 prose prose-sm max-w-none text-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 mt-0">1. Responsable du traitement</h2>
          <p>
            English Hills Language Center, sis à Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca, Maroc,
            est responsable du traitement de vos données personnelles collectées via le formulaire
            de pré-inscription et les services associés.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">2. Données collectées</h2>
          <ul>
            <li>Identité : nom complet, date de naissance, catégorie d&apos;âge</li>
            <li>Coordonnées : téléphone, email apprenant, email parent/tuteur</li>
            <li>Informations pédagogiques : niveau CEFR estimé, message de contact</li>
            <li>Preuve de consentement à la pré-inscription : date, origine du formulaire et version de cette notice</li>
            <li>Les pièces jointes ne sont pas acceptées dans le formulaire public de pré-inscription.</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900">3. Finalités du traitement</h2>
          <ul>
            <li>Traitement de votre demande de pré-inscription et contact de suivi</li>
            <li>Gestion administrative, pédagogique et financière de votre dossier</li>
            <li>Communication relative aux cours, évaluations et événements</li>
            <li>Obligations légales et comptables</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-900">4. Base légale</h2>
          <p>
            Le formulaire de pré-inscription demande votre accord avant l&apos;envoi. Les autres traitements
            administratifs, pédagogiques et financiers nécessitent une analyse des bases applicables par le centre.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">5. Destinataires</h2>
          <p>
            L&apos;accès dans l&apos;application dépend du rôle et du lien avec l&apos;apprenant.
            Les services techniques utilisés pour l&apos;hébergement, la base de données, l&apos;envoi d&apos;emails
            et la surveillance des erreurs peuvent traiter les données nécessaires à leur fonction.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">6. Durée de conservation</h2>
          <p>
            Les durées de conservation et les modalités de suppression doivent être confirmées
            par le centre selon les obligations applicables. Contactez le centre pour connaître
            la durée applicable à votre dossier.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">7. Sécurité</h2>
          <p>
            Les données sont stockées sur des serveurs sécurisés. L&apos;accès est protégé par
            authentification individuelle, contrôle d&apos;accès basé sur les rôles et chiffrement
            des secrets sensibles.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">8. Vos droits</h2>
          <p>
            Conformément à la loi 09-08, vous disposez d&apos;un droit d&apos;accès, de rectification,
            d&apos;opposition et de suppression de vos données personnelles. Pour exercer ces droits,
            adressez votre demande à&nbsp;:
          </p>
          <p className="font-medium">
            English Hills Language Center<br />
            Almaz 2, Hills Business Center<br />
            Bâtiment B, Bureau 6<br />
            Casablanca, Maroc<br />
            Email&nbsp;: <a href="mailto:contact@english-hills.com" className="text-primary underline">contact@english-hills.com</a>
          </p>
          <p>
            Vous pouvez également introduire une réclamation auprès de la Commission Nationale
            de Contrôle de la Protection des Données à Caractère Personnel (CNDP) — <a
              href="https://www.cndp.ma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >www.cndp.ma</a>.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">9. Mineurs</h2>
          <p>
            Pour les apprenants mineurs, le traitement repose sur le consentement du parent ou
            tuteur légal, recueilli lors de l&apos;inscription.
          </p>

          <p className="text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
            English Hills Language Center · Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca
          </p>
        </div>
      </div>
    </div>
  );
}
