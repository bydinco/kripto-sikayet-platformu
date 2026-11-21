import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kripto Şikayet ve Risk Platformu',
  description: 'Global kripto şikayet ve risk platformu',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
