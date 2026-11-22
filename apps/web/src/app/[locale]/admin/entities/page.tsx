import type { Metadata } from 'next';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import { AdminEntitiesPanel } from '../../../../components/admin/admin-entities-panel';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/entities'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/admin/entities',
    title: dictionary.admin.entities.title,
    description: '',
    noindex: true,
  });
}

export default async function AdminEntitiesPage({ params }: PageProps<'/[locale]/admin/entities'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <AdminEntitiesPanel locale={locale} dictionary={dictionary} />
    </div>
  );
}
