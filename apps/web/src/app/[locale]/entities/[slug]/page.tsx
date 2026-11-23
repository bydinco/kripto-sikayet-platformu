import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api-client';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import type { ApiEntity, ApiMarketPrice, ApiReport, ApiRiskScore, ReportStatus } from '../../../../lib/api-models';
import { formatCompactUsd, formatDate, formatPercent, formatPriceChangePercent, formatUsd, humanizeEnum } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import { RiskMeter } from '../../../../components/risk-meter';
import { Pill } from '../../../../components/pill';

type Tab = 'overview' | 'reports' | 'responses' | 'contract' | 'history';
const TABS: Tab[] = ['overview', 'reports', 'responses', 'contract', 'history'];
const PUBLIC_STATUSES: ReportStatus[] = ['PUBLISHED', 'DISPUTED', 'RESOLVED'];

// Tagged by slug — known upfront from the route, unlike entityId (which
// this very fetch resolves). The API revalidates this tag after
// recomputeScore. See CLAUDE.md's "On-demand revalidation" section.
async function getEntity(idOrSlug: string): Promise<ApiEntity | null> {
  try {
    return await apiFetch<ApiEntity>(`/entities/${encodeURIComponent(idOrSlug)}`, {
      next: { revalidate: 600, tags: [`entity:${idOrSlug}`] },
    });
  } catch {
    return null;
  }
}

async function getEntityReports(slug: string, entityId: string): Promise<ApiReport[]> {
  try {
    return await apiFetch<ApiReport[]>(`/reports?entityId=${entityId}&take=50`, {
      next: { revalidate: 600, tags: [`entity:${slug}`, `entity-id:${entityId}`, 'home'] },
    });
  } catch {
    return [];
  }
}

// Visibility is enforced server-side (apps/api ScoringService): a public,
// unauthenticated fetch here only ever gets scores back whose model is
// active. Ordered by computedAt desc — [0] is current, the rest is history.
// 'scoring' additionally lets a model activate/deactivate (which can touch
// many entities at once) invalidate this without enumerating every one.
async function getRiskScores(slug: string, entityId: string): Promise<ApiRiskScore[]> {
  try {
    return await apiFetch<ApiRiskScore[]>(`/scoring?entityId=${entityId}`, {
      next: { revalidate: 300, tags: [`entity:${slug}`, `entity-id:${entityId}`, 'scoring'] },
    });
  } catch {
    return [];
  }
}

// Time-based ISR only, same as the price ticker — not tagged for
// on-demand revalidation (the price feed runs on its own clock).
type ResolvedMarketPrice = ApiMarketPrice & { price: number };

async function getMarketPrice(slug: string): Promise<ResolvedMarketPrice | null> {
  try {
    const price = await apiFetch<ApiMarketPrice>(`/market/prices/${encodeURIComponent(slug)}`, { next: { revalidate: 120 } });
    return price.price === null ? null : (price as ResolvedMarketPrice);
  } catch {
    return null;
  }
}

function levelPillVariant(level: ApiRiskScore['level']): 'co' | 'wa' | 'ok' | 'ne' {
  if (level === 'CRITICAL_SIGNAL') return 'co';
  if (level === 'HIGH_RISK_SIGNAL') return 'wa';
  if (level === 'LOW') return 'ok';
  return 'ne';
}

export async function generateMetadata({ params }: PageProps<'/[locale]/entities/[slug]'>): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const dictionary = getDictionary(locale);
  const entity = await getEntity(slug);

  if (!entity) {
    return buildMetadata({ locale, path: `/entities/${slug}`, title: dictionary.siteName, description: '', noindex: true });
  }

  const reports = await getEntityReports(slug, entity.id);
  return buildMetadata({
    locale,
    path: `/entities/${entity.slug}`,
    title: `${entity.name} — ${dictionary.siteName}`,
    description: entity.summary ?? dictionary.home.tagline,
    // Thin pages (no public reports yet) aren't worth indexing.
    noindex: reports.length === 0,
  });
}

export default async function EntityDetailPage({
  params,
  searchParams,
}: PageProps<'/[locale]/entities/[slug]'>) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const resolvedSearchParams = await searchParams;
  const dictionary = getDictionary(locale);
  const entity = await getEntity(slug);
  if (!entity) notFound();

  const rawTab = typeof resolvedSearchParams.tab === 'string' ? resolvedSearchParams.tab : 'overview';
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview';
  const statusFilter = typeof resolvedSearchParams.status === 'string' ? (resolvedSearchParams.status as ReportStatus) : '';

  const [reports, scores, marketPrice] = await Promise.all([
    getEntityReports(slug, entity.id),
    getRiskScores(slug, entity.id),
    entity.type === 'COIN' ? getMarketPrice(slug) : Promise.resolve(null),
  ]);
  const riskScore = scores[0] ?? null;
  const filteredReports = statusFilter ? reports.filter((r) => r.status === statusFilter) : reports;
  const latestAudit = entity.coin?.audits[0] ?? null;

  function tabHref(next: Tab) {
    return `/${locale}/entities/${slug}?tab=${next}`;
  }

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div className="stack">
        <h1>{entity.name}</h1>
        <p className="muted">{humanizeEnum(entity.type)}</p>
        {entity.summary ? <p>{entity.summary}</p> : null}
      </div>

      <div className="row" style={{ borderBottom: '1px solid var(--ln)' }}>
        {TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className="muted"
            style={
              t === tab
                ? { color: 'var(--tx)', fontWeight: 600, borderBottom: '2px solid var(--ac)', padding: '8px 4px' }
                : { padding: '8px 4px' }
            }
          >
            {dictionary.entityDetail.tabs[t]}
          </Link>
        ))}
      </div>

      <div className="layout-two-col">
        <div className="stack">
          {tab === 'overview' ? (
            <div className="card stack">
              <h2>{dictionary.entityDetail.statsTitle}</h2>
              {entity.stats ? (
                <div className="row" style={{ gap: 32 }}>
                  <div>
                    <div className="muted">{dictionary.entityDetail.responseRate}</div>
                    <strong>{formatPercent(entity.stats.responseRatePct)}</strong>
                  </div>
                  <div>
                    <div className="muted">{dictionary.entityDetail.resolutionRate}</div>
                    <strong>{formatPercent(entity.stats.resolutionRatePct)}</strong>
                  </div>
                  <div>
                    <div className="muted">{dictionary.entityDetail.avgSatisfaction}</div>
                    <strong>
                      {entity.stats.avgSatisfaction ? `${Number(entity.stats.avgSatisfaction).toFixed(1)}/5` : dictionary.entityDetail.noData}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="muted">{dictionary.entityDetail.noData}</p>
              )}
            </div>
          ) : null}

          {tab === 'reports' ? (
            <div className="stack">
              <div className="row">
                <Link href={tabHref('reports')} className={!statusFilter ? 'pill pill-ac' : 'pill pill-ne'}>
                  {dictionary.admin.reportsQueue.statusAll}
                </Link>
                {PUBLIC_STATUSES.map((s) => (
                  <Link
                    key={s}
                    href={`${tabHref('reports')}&status=${s}`}
                    className={statusFilter === s ? 'pill pill-ac' : 'pill pill-ne'}
                  >
                    {dictionary.statuses[s]}
                  </Link>
                ))}
              </div>
              {filteredReports.length === 0 ? (
                <p className="muted">{dictionary.entityDetail.noReports}</p>
              ) : (
                <div>
                  {filteredReports.map((report) => (
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
            </div>
          ) : null}

          {tab === 'responses' ? (
            <div className="card stack">
              <h2>{dictionary.entityDetail.tabs.responses}</h2>
              {entity.stats ? (
                <div className="row" style={{ gap: 32 }}>
                  <div>
                    <div className="muted">{dictionary.entityDetail.responseRate}</div>
                    <strong>{formatPercent(entity.stats.responseRatePct)}</strong>
                  </div>
                  <div>
                    <div className="muted">{dictionary.entityDetail.resolutionRate}</div>
                    <strong>{formatPercent(entity.stats.resolutionRatePct)}</strong>
                  </div>
                </div>
              ) : (
                <p className="muted">{dictionary.entityDetail.noData}</p>
              )}
            </div>
          ) : null}

          {tab === 'contract' ? (
            <div className="card stack">
              <h2>{dictionary.entityDetail.contractTitle}</h2>
              {!latestAudit ? (
                <p className="muted">{dictionary.entityDetail.contractFields.noData}</p>
              ) : (
                <div className="stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{dictionary.entityDetail.contractFields.honeypot}</span>
                    <Pill variant={latestAudit.isHoneypot ? 'co' : 'ok'}>{String(latestAudit.isHoneypot ?? '—')}</Pill>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{dictionary.entityDetail.contractFields.liquidityLocked}</span>
                    <Pill variant={latestAudit.liquidityLocked ? 'ok' : 'wa'}>{String(latestAudit.liquidityLocked ?? '—')}</Pill>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{dictionary.entityDetail.contractFields.top10Holders}</span>
                    <span className="muted">{latestAudit.top10HolderPct ?? '—'}%</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{dictionary.entityDetail.contractFields.sellTax}</span>
                    <span className="muted">{latestAudit.sellTaxPct ?? '—'}%</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{dictionary.entityDetail.contractFields.ownerRenounced}</span>
                    <Pill variant={latestAudit.ownerRenounced ? 'ok' : 'wa'}>{String(latestAudit.ownerRenounced ?? '—')}</Pill>
                  </div>
                  <span className="muted" style={{ fontSize: '0.8125rem' }}>
                    {formatDate(latestAudit.scannedAt, locale)}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="card stack">
              <h2>{dictionary.entityDetail.historyTitle}</h2>
              {scores.length === 0 ? (
                <p className="muted">{dictionary.entityDetail.noHistory}</p>
              ) : (
                scores.map((s) => (
                  <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">{formatDate(s.computedAt, locale)}</span>
                    {s.score === null ? (
                      <Pill variant="ne">{dictionary.riskLevels.INSUFFICIENT_DATA}</Pill>
                    ) : (
                      <span className="row">
                        <span className="numeric">{s.score}/100</span>
                        <Pill variant={levelPillVariant(s.level)}>{dictionary.riskLevels[s.level]}</Pill>
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="stack">
          <div className="card stack">
            <h2>{dictionary.entityDetail.scoreTitle}</h2>
            {!riskScore ? (
              <p className="muted">{dictionary.entityDetail.noModel}</p>
            ) : riskScore.score === null ? (
              <p className="muted">{dictionary.entityDetail.insufficientData}</p>
            ) : (
              <div className="stack">
                <RiskMeter score={riskScore.score} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="numeric" style={{ fontSize: '1.75rem' }}>
                    {riskScore.score}/100
                  </span>
                  <Pill variant={levelPillVariant(riskScore.level)}>{dictionary.riskLevels[riskScore.level]}</Pill>
                </div>
                <p className="muted">
                  {dictionary.entityDetail.confidenceLabel}: {riskScore.confidence}% ·{' '}
                  {riskScore.factors.length}/{riskScore.model.factors?.length ?? riskScore.factors.length}{' '}
                  {dictionary.entityDetail.basedOnSignals}
                </p>
                {riskScore.factors.length > 0 ? (
                  <div className="stack">
                    <h3 style={{ fontSize: '0.9375rem' }}>{dictionary.entityDetail.whyThisScore}</h3>
                    {riskScore.factors.map((f) => (
                      <div key={f.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">{f.factor.name}</span>
                        <span>{f.rawValue}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <Link href={`/${locale}/methodology`} className="muted">
              {dictionary.entityDetail.methodologyLink}
            </Link>
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              {dictionary.entityDetail.disclaimer}
            </p>
          </div>

          {marketPrice ? (
            <div className="card stack">
              <h2>{dictionary.market.boxTitle}</h2>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">{dictionary.market.priceLabel}</span>
                <span className="numeric">{formatUsd(marketPrice.price, locale)}</span>
              </div>
              {marketPrice.change24h !== null ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">{dictionary.market.change24hLabel}</span>
                  <span className={marketPrice.change24h >= 0 ? 'price-change-up' : 'price-change-down'}>
                    {formatPriceChangePercent(marketPrice.change24h, locale)}
                  </span>
                </div>
              ) : null}
              {marketPrice.marketCap !== null ? (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">{dictionary.market.marketCapLabel}</span>
                  <span>{formatCompactUsd(marketPrice.marketCap, locale)}</span>
                </div>
              ) : null}
              {marketPrice.updatedAt ? (
                <span className="muted" style={{ fontSize: '0.8125rem' }}>
                  {dictionary.market.updatedAtLabel}: {formatDate(marketPrice.updatedAt, locale)}
                </span>
              ) : null}
              <a
                href="https://www.coingecko.com"
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="muted"
                style={{ fontSize: '0.75rem' }}
              >
                {dictionary.market.attribution}
              </a>
              <p className="muted" style={{ fontSize: '0.75rem' }}>
                {dictionary.market.disclaimer}
              </p>
            </div>
          ) : null}

          <div className="stack">
            <Link href={`/${locale}/reports/new`} className="button" style={{ display: 'block', textAlign: 'center' }}>
              {dictionary.nav.submitReport}
            </Link>
            {/* No claim/watch flow exists in the API yet — disabled, not pretending to work. */}
            <button type="button" className="button button-secondary" disabled title={dictionary.entityDetail.claimPage}>
              {dictionary.entityDetail.claimPage}
            </button>
            <button type="button" className="button button-secondary" disabled title={dictionary.entityDetail.watchEntity}>
              {dictionary.entityDetail.watchEntity}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
