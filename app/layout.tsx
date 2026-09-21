import type { Metadata, Viewport } from 'next';
import './invitation.css';
const SITE_URL = "https://rukhsati-invitation.vercel.app";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: 'SANIYA & HASNAIN — Rukhsati',

  description:
    'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi — 27 September 2026, Raza Hall, Govandi West, Mumbai.',

  openGraph: {
    title: 'SANIYA & HASNAIN — Rukhsati',

    description:
      'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi.',

    url: SITE_URL,
    siteName: 'SANIYA & HASNAIN — Rukhsati',
    type: 'website',

    images: [
      {
        url: `${SITE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: 'SANIYA & HASNAIN — Rukhsati Invitation',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'SANIYA & HASNAIN — Rukhsati',
    description:
      'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi.',
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#041F1C',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
