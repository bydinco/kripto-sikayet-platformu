import type { Metadata } from 'next';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import { AdminReportsQueue } from '../../../../components/admin/admin-reports-queue';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/reports'>): Promise<Metadata> {
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

export default async function AdminReportsPage({ params }: PageProps<'/[locale]/admin/reports'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1>{dictionary.admin.reportsQueue.title}</h1>
      <AdminReportsQueue locale={locale} dictionary={dictionary} />
    </div>
  );
}
