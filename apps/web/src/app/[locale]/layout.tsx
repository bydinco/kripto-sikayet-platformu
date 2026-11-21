import { notFound } from 'next/navigation';
import { AuthProvider } from '../../lib/auth-context';
import { getDictionary } from '../../dictionaries/get-dictionary';
import { isSupportedLocale, SUPPORTED_LOCALES } from '../../lib/locale';
import { SetHtmlLang } from '../../components/set-html-lang';
import { SiteHeader } from '../../components/site-header';
import { SiteFooter } from '../../components/site-footer';

export { SUPPORTED_LOCALES, type Locale } from '../../lib/locale';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  const dictionary = getDictionary(locale);

  return (
    <AuthProvider>
      <SetHtmlLang lang={locale} />
      <SiteHeader locale={locale} dictionary={dictionary} />
      <main>{children}</main>
      <SiteFooter dictionary={dictionary} />
    </AuthProvider>
  );
}
