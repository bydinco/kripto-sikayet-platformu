import type { Metadata } from 'next';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import { AdminNoticesQueue } from '../../../../components/admin/admin-notices-queue';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/notices'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/admin/notices',
    title: dictionary.admin.notices.title,
    description: '',
    noindex: true,
  });
}

export default async function AdminNoticesPage({ params }: PageProps<'/[locale]/admin/notices'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1>{dictionary.admin.notices.title}</h1>
      <AdminNoticesQueue locale={locale} dictionary={dictionary} />
    </div>
  );
}
