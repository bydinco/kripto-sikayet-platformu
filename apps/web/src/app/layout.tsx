import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import './globals.css';

// next/font self-hosts at build time — no runtime request to Google fonts.
const heading = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const body = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kripto Şikayet ve Risk Platformu',
  description: 'Global kripto şikayet ve risk platformu',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
