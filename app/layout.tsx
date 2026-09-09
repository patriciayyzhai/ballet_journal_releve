import type { Metadata, Viewport } from 'next';
import './globals.css';
import './vocab.css';

export const metadata: Metadata = {
  title: 'Relevé — Ballet Journal',
  description: 'A private journal for the things your body learns in ballet.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Relevé', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbfaf7',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
