import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, MessageCircle, Phone } from 'lucide-react';

// Online pre-registration is closed (plan Enrollment at payment, D4): an
// enrollment starts at the centre, with a payment. This public page only gives
// the centre's contact details, as published on the English Hills website.
export const metadata = {
  title: 'Inscriptions au centre — English Hills',
  description: 'Les inscriptions se font au centre English Hills. Téléphone, WhatsApp, adresse et horaires.',
};

const WEBSITE = 'https://english-hills.com';
const PHONE_LABEL = '+212 6 64 23 90 91';
const PHONE_HREF = 'tel:+212664239091';
const WHATSAPP_HREF = `${WEBSITE}/contact-camp`;
const CONTACT_HREF = `${WEBSITE}/contact`;
const linkClass = 'font-semibold text-primary underline hover:opacity-80';

export default function PublicEnrollment() {
  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: '#f0f4fa' }}>
      <div className="max-w-xl mx-auto">
        <div className="mb-4">
          <a href={WEBSITE} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} /> Retour au site English Hills
          </a>
        </div>

        <div className="text-center mb-8">
          <Image src="/eh-logo.png" alt="English Hills" width={140} height={56} priority className="h-14 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-primary">Inscriptions au centre</h1>
          <p className="text-xs text-gray-400 mt-1 italic">&quot;Learn Today, Lead Tomorrow&quot;</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5 text-sm text-gray-700">
          <p>
            Les inscriptions en ligne sont fermées. L’inscription se fait au centre, avec notre équipe d’accueil&nbsp;:
            appelez-nous, écrivez-nous sur WhatsApp ou passez nous voir.
          </p>

          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <Phone size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Téléphone</p>
                <a href={PHONE_HREF} className={linkClass}>{PHONE_LABEL}</a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">WhatsApp</p>
                <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className={linkClass}>Discuter sur WhatsApp</a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Adresse</p>
                <p>English Hills Language Center<br />Almaz 2, Hills Business Center<br />Bâtiment B, Bureau 6<br />Casablanca, Maroc</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Clock size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Horaires</p>
                <p>Lun–Dim&nbsp;: 9h – 20h</p>
              </div>
            </li>
          </ul>

          <p className="border-t border-gray-200 pt-4">
            Une question&nbsp;? Écrivez-nous depuis la <a href={CONTACT_HREF} className={linkClass}>page contact du site</a>.
          </p>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          <Link href="/privacy" className="underline hover:opacity-80">Politique de confidentialité</Link>
        </p>
      </div>
    </div>
  );
}
