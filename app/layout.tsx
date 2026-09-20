import type { Metadata, Viewport } from 'next';
import './invitation.css';

export const metadata: Metadata = {
  title: 'SANIYA & HASNAIN — Rukhsati',
  description: 'Rukhsati invitation for Saniya Nadeem Sayyed and Hasnain Furqan Saifi — 27 September 2026, Raza Hall, Govandi West, Mumbai.',
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
