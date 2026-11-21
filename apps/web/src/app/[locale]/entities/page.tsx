import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '../../../lib/api-client';
import { buildMetadata } from '../../../lib/seo';
import { getDictionary } from '../../../dictionaries/get-dictionary';
import type { Locale } from '../../../lib/locale';
import type { ApiEntity } from '../../../lib/api-models';
import { humanizeEnum } from '../../../lib/format';

export async function generateMetadata({ params }: PageProps<'/[locale]/entities'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/entities',
    title: `${dictionary.entities.title} — ${dictionary.siteName}`,
    description: dictionary.home.tagline,
  });
}

async function searchEntities(q: string): Promise<ApiEntity[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  try {
    return await apiFetch<ApiEntity[]>(`/entities${query}`, { next: { revalidate: 600 } });
  } catch {
    return [];
  }
}

export default async function EntitiesPage({ params, searchParams }: PageProps<'/[locale]/entities'>) {
  const { locale } = (await params) as { locale: Locale };
  const resolvedSearchParams = await searchParams;
  const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : '';
  const dictionary = getDictionary(locale);
  const entities = await searchEntities(q);

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <h1>{dictionary.entities.title}</h1>
      <form action={`/${locale}/entities`} className="row">
        <input
          className="input"
          type="text"
          name="q"
          defaultValue={q}
          placeholder={dictionary.entities.searchPlaceholder}
        />
        <button className="button" type="submit">
          {dictionary.entities.searchButton}
        </button>
      </form>

      {entities.length === 0 ? (
        <p className="muted">{dictionary.entities.empty}</p>
      ) : (
        <div>
          {entities.map((entity) => (
            <Link
              key={entity.id}
              href={`/${locale}/entities/${entity.slug}`}
              className="card"
              style={{ display: 'block' }}
            >
              <strong>{entity.name}</strong>
              <p className="muted">{humanizeEnum(entity.type)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
