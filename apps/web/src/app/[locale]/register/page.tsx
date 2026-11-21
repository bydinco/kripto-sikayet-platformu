import { Suspense } from 'react';
import type { Metadata } from 'next';
import { buildMetadata } from '../../../lib/seo';
import { getDictionary } from '../../../dictionaries/get-dictionary';
import type { Locale } from '../../../lib/locale';
import { RegisterForm } from '../../../components/register-form';

export async function generateMetadata({ params }: PageProps<'/[locale]/register'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/register',
    title: dictionary.auth.registerTitle,
    description: '',
    noindex: true,
  });
}

export default async function RegisterPage({ params }: PageProps<'/[locale]/register'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <Suspense fallback={null}>
        <RegisterForm locale={locale} dictionary={dictionary} />
      </Suspense>
    </div>
  );
}
