import type { Metadata } from 'next';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import { ReportForm } from '../../../../components/report-form';

export async function generateMetadata({ params }: PageProps<'/[locale]/reports/new'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/reports/new',
    title: dictionary.reportForm.title,
    description: '',
    noindex: true,
  });
}

export default async function NewReportPage({ params }: PageProps<'/[locale]/reports/new'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 640 }}>
      <ReportForm locale={locale} dictionary={dictionary} />
    </div>
  );
}
