import type { Metadata } from 'next';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import { MyReportsList } from '../../../../components/my-reports-list';

export async function generateMetadata({ params }: PageProps<'/[locale]/reports/mine'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/reports/mine',
    title: dictionary.myReports.title,
    description: '',
    noindex: true,
  });
}

export default async function MyReportsPage({ params }: PageProps<'/[locale]/reports/mine'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1>{dictionary.myReports.title}</h1>
      <MyReportsList locale={locale} dictionary={dictionary} />
    </div>
  );
}
