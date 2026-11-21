import { Suspense } from 'react';
import type { Metadata } from 'next';
import { buildMetadata } from '../../../lib/seo';
import { getDictionary } from '../../../dictionaries/get-dictionary';
import type { Locale } from '../../../lib/locale';
import { LoginForm } from '../../../components/login-form';

export async function generateMetadata({ params }: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({ locale, path: '/login', title: dictionary.auth.loginTitle, description: '', noindex: true });
}

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <Suspense fallback={null}>
        <LoginForm locale={locale} dictionary={dictionary} />
      </Suspense>
    </div>
  );
}
