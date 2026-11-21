import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch } from '../../lib/api-client';
import { buildMetadata } from '../../lib/seo';
import { getDictionary } from '../../dictionaries/get-dictionary';
import type { Locale } from '../../lib/locale';
import type { ApiReport } from '../../lib/api-models';
import { StatusBadge } from '../../components/status-badge';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(locale as Locale);
  return buildMetadata({ locale: locale as Locale, path: '', title: dictionary.siteName, description: dictionary.home.tagline });
}

async function getRecentReports(): Promise<ApiReport[]> {
  try {
    return await apiFetch<ApiReport[]>('/reports?take=10', { next: { revalidate: 600 } });
  } catch {
    return [];
  }
}

export default async function LocaleHomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  const reports = await getRecentReports();

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <section className="stack">
        <h1>{dictionary.siteName}</h1>
        <p className="muted">{dictionary.home.tagline}</p>
        <form action={`/${locale}/entities`} className="row">
          <input className="input" type="text" name="q" placeholder={dictionary.home.searchPlaceholder} />
          <button className="button" type="submit">
            {dictionary.home.searchButton}
          </button>
        </form>
      </section>

      <section className="stack">
        <h2>{dictionary.home.recentReportsTitle}</h2>
        {reports.length === 0 ? (
          <p className="muted">{dictionary.home.noRecentReports}</p>
        ) : (
          <div>
            {reports.map((report) => (
              <Link key={report.id} href={`/${locale}/reports/${report.id}`} className="card" style={{ display: 'block' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{report.title}</strong>
                  <StatusBadge status={report.status} dictionary={dictionary} />
                </div>
                <p className="muted">{dictionary.categories[report.category]}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
