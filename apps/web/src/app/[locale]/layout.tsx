import { notFound } from 'next/navigation';

export const SUPPORTED_LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    notFound();
  }
  return children;
}
