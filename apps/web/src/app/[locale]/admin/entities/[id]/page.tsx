import type { Metadata } from 'next';
import { buildMetadata } from '../../../../../lib/seo';
import { getDictionary } from '../../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../../lib/locale';
import { AdminEntityEdit } from '../../../../../components/admin/admin-entity-edit';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/entities/[id]'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/admin/entities',
    title: dictionary.admin.entities.editTitle,
    description: '',
    noindex: true,
  });
}

export default async function AdminEntityEditPage({ params }: PageProps<'/[locale]/admin/entities/[id]'>) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <AdminEntityEdit id={id} locale={locale} dictionary={dictionary} />
    </div>
  );
}
