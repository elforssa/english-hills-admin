import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'English Hills — Admin',
  description: 'English Hills Language Center administration platform.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="font-inter antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
