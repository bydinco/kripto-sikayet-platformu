import type { Metadata } from 'next';
import { buildMetadata } from '../../../../../lib/seo';
import { getDictionary } from '../../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../../lib/locale';
import { AdminReportDetail } from '../../../../../components/admin/admin-report-detail';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/reports/[id]'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/admin/reports',
    title: dictionary.admin.reportsQueue.title,
    description: '',
    noindex: true,
  });
}

export default async function AdminReportDetailPage({ params }: PageProps<'/[locale]/admin/reports/[id]'>) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <AdminReportDetail id={id} locale={locale} dictionary={dictionary} />
    </div>
  );
}
