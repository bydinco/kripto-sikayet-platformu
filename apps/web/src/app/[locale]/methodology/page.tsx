import type { Metadata } from 'next';
import { apiFetch } from '../../../lib/api-client';
import { buildMetadata } from '../../../lib/seo';
import { getDictionary } from '../../../dictionaries/get-dictionary';
import type { Locale } from '../../../lib/locale';
import type { ApiRiskModel } from '../../../lib/api-models';
import { humanizeEnum } from '../../../lib/format';

// Tagged 'methodology' — the API revalidates this on model activate/
// deactivate, which is exactly what this page needs to reflect immediately
// rather than waiting out the 1h revalidate window. See CLAUDE.md.
async function getActiveModels(): Promise<ApiRiskModel[]> {
  try {
    return await apiFetch<ApiRiskModel[]>('/scoring/models/active', {
      next: { revalidate: 3600, tags: ['methodology'] },
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/methodology'>): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  return buildMetadata({
    locale,
    path: '/methodology',
    title: `${dictionary.methodologyPage.title} — ${dictionary.siteName}`,
    description: dictionary.methodologyPage.intro,
  });
}

export default async function MethodologyPage({ params }: PageProps<'/[locale]/methodology'>) {
  const { locale } = (await params) as { locale: Locale };
  const dictionary = getDictionary(locale);
  const models = await getActiveModels();

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div className="stack">
        <h1>{dictionary.methodologyPage.title}</h1>
        <p className="muted">{dictionary.methodologyPage.intro}</p>
      </div>

      {models.length === 0 ? (
        <p className="muted">{dictionary.methodologyPage.empty}</p>
      ) : (
        models.map((model) => (
          <div key={model.id} className="card stack">
            <h2>{humanizeEnum(model.entityType)}</h2>
            {model.methodology ? <p className="muted">{model.methodology}</p> : null}
            <div>
              {(model.factors ?? [])
                .slice()
                .sort((a, b) => b.maxPoints - a.maxPoints)
                .map((factor) => (
                  <div key={factor.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div>
                      <strong>{factor.name}</strong>
                      {factor.description ? <p className="muted">{factor.description}</p> : null}
                    </div>
                    <div className="row">
                      <span className="muted">
                        {dictionary.methodologyPage.sourceLabel}: {factor.dataSource ?? '—'}
                      </span>
                      <span className="badge">
                        {dictionary.methodologyPage.weightLabel}: {factor.maxPoints}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
