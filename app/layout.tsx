import type { Metadata, Viewport } from 'next';
import './invitation.css';

export const metadata: Metadata = {
  title: 'SANIYA & HASNAIN — Rukhsati',
  description:
    'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi — 27 September 2026, Raza Hall, Govandi West, Mumbai.',

  openGraph: {
    title: 'SANIYA & HASNAIN — Rukhsati',
    description:
      'You are warmly invited to celebrate the Rukhsati of Saniya Nadeem Sayyed and Hasnain Furqan Saifi.',
    type: 'website',
    siteName: 'SANIYA & HASNAIN — Rukhsati',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Saniya & Hasnain — Rukhsati Invitation',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'SANIYA & HASNAIN — Rukhsati',
    description:
      'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi.',
    images: ['/og-image.jpg'],
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
