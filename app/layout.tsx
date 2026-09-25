import type { Metadata, Viewport } from 'next';
import './invitation.css';

const SITE_URL = 'https://rukhsati-invitation.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: 'SANIYA & HASNAIN — Rukhsati',

  description:
    '27 September 2026 • Welcome Hall, Govandi East, Mumbai • Rukhsati after Maghrib.',

  openGraph: {
    title: 'SANIYA & HASNAIN — Rukhsati',

    description:
      '27 September 2026 • Welcome Hall, Govandi East, Mumbai • Rukhsati after Maghrib.',

    url: SITE_URL,

    siteName: 'SANIYA & HASNAIN — Rukhsati',

    type: 'website',

    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: 'Saniya and Hasnain Rukhsati Invitation',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',

    title: 'SANIYA & HASNAIN — Rukhsati',

    description:
      '27 September 2026 • Welcome Hall, Govandi East, Mumbai.',

    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#041F1C',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}