import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'English Hills — Admin',
  description: 'English Hills Language Center administration platform.',
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="font-inter antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-white focus:shadow-lg"
        >
          Passer au contenu principal
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
