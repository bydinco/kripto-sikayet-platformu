import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, evidenceFileUrl } from '../../../../lib/api-client';
import { buildMetadata } from '../../../../lib/seo';
import { getDictionary } from '../../../../dictionaries/get-dictionary';
import type { Locale } from '../../../../lib/locale';
import type { ApiEntity, ApiEntityResponse, ApiEvidence, ApiReport, ApiRiskScore } from '../../../../lib/api-models';
import { formatDate } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import { Pill } from '../../../../components/pill';
import { RiskMeter } from '../../../../components/risk-meter';
import { ShareButton } from '../../../../components/share-button';
import { ReportNoticeForm } from '../../../../components/report-notice-form';

// Every fetch on this page is tagged by reportId — the API revalidates
// this tag on every status transition, especially REMOVED/RESTORE (the
// page flips between hidden/visible). See CLAUDE.md.
async function getReport(id: string): Promise<ApiReport | null> {
  try {
    return await apiFetch<ApiReport>(`/reports/${encodeURIComponent(id)}`, {
      next: { revalidate: 300, tags: [`report:${id}`] },
    });
  } catch {
    return null;
  }
}

async function getEntity(reportId: string, entityId: string): Promise<ApiEntity | null> {
  try {
    return await apiFetch<ApiEntity>(`/entities/${encodeURIComponent(entityId)}`, {
      next: { revalidate: 600, tags: [`report:${reportId}`] },
    });
  } catch {
    return null;
  }
}

async function getEvidence(reportId: string): Promise<ApiEvidence[]> {
  try {
    return await apiFetch<ApiEvidence[]>(`/evidence?reportId=${encodeURIComponent(reportId)}`, {
      next: { revalidate: 300, tags: [`report:${reportId}`] },
    });
  } catch {
    return [];
  }
}

async function getResponses(reportId: string): Promise<ApiEntityResponse[]> {
  try {
    return await apiFetch<ApiEntityResponse[]>(`/reports/${encodeURIComponent(reportId)}/responses`, {
      next: { revalidate: 300, tags: [`report:${reportId}`] },
    });
  } catch {
    return [];
  }
}

async function getLatestRiskScore(reportId: string, entityId: string): Promise<ApiRiskScore | null> {
  try {
    const scores = await apiFetch<ApiRiskScore[]>(`/scoring?entityId=${entityId}`, {
      next: { revalidate: 300, tags: [`report:${reportId}`, `entity-id:${entityId}`, 'scoring'] },
    });
    return scores[0] ?? null;
  } catch {
    return null;
  }
}

// Only ever render a LINK evidence value as a clickable anchor when it's
// genuinely http(s) — the backend already enforces this at creation time,
// this is a second, independent check at render time.
function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/reports/[id]'>): Promise<Metadata> {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  const report = await getReport(id);
  if (!report) {
    return buildMetadata({ locale, path: `/reports/${id}`, title: dictionary.siteName, description: '', noindex: true });
  }
  return buildMetadata({
    locale,
    path: `/reports/${report.id}`,
    title: `${report.title} — ${dictionary.siteName}`,
    description: report.body.slice(0, 160),
  });
}

export default async function ReportDetailPage({ params }: PageProps<'/[locale]/reports/[id]'>) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  const dictionary = getDictionary(locale);
  const report = await getReport(id);
  if (!report) notFound();

  const [entity, evidence, responses] = await Promise.all([
    getEntity(report.id, report.entityId),
    getEvidence(report.id),
    getResponses(report.id),
  ]);
  const riskScore = entity ? await getLatestRiskScore(report.id, entity.id) : null;
  const isDisputed = responses.some((r) => r.disputed);

  return (
    <div className="container stack" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <div className="layout-two-col">
        <div className="stack">
          <div className="stack">
            {entity ? (
              <Link href={`/${locale}/entities/${entity.slug}`} className="muted">
                {entity.name}
              </Link>
            ) : null}
            <div className="row">
              <Pill variant="ne">{dictionary.reportDetail.userClaimBadge}</Pill>
              <StatusBadge status={report.status} dictionary={dictionary} />
              {isDisputed ? <Pill variant="wa">{dictionary.reportDetail.disputedBadge}</Pill> : null}
            </div>
            <h1>{report.title}</h1>
            <p className="muted">{dictionary.categories[report.category]}</p>
            {/* Plain-text rendering only — never dangerouslySetInnerHTML for user content. */}
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.body}</p>
            <div className="row">
              {report.lossUsd ? (
                <span className="muted">
                  {dictionary.reportDetail.lossLabel}: ${report.lossUsd}
                </span>
              ) : null}
              {report.incidentAt ? (
                <span className="muted">
                  {dictionary.reportDetail.incidentDateLabel}: {formatDate(report.incidentAt, locale)}
                </span>
              ) : null}
            </div>
            {report.status === 'RESOLVED' && report.satisfactionRating ? (
              <p>
                {dictionary.reportDetail.satisfactionLabel}: {report.satisfactionRating}/5
              </p>
            ) : null}
            <div className="row">
              <ShareButton label={dictionary.reportDetail.shareButton} copiedLabel={dictionary.reportDetail.shareCopied} />
              {/* No ReportVote API yet — disabled, not pretending to work. */}
              <button type="button" className="button button-secondary" disabled title={dictionary.reportDetail.meTooButton}>
                {dictionary.reportDetail.meTooButton}
              </button>
            </div>
          </div>

          <div className="stack">
            <h2>{dictionary.reportDetail.evidenceTitle}</h2>
            {evidence.length === 0 ? (
              <p className="muted">{dictionary.reportDetail.noEvidence}</p>
            ) : (
              evidence.map((item) =>
                item.type === 'SCREENSHOT' && item.storageKey ? (
                  // Plain <a>/<img> — no JS needed to open the full-size
                  // file. The API only ever returns approved evidence on a
                  // publicly visible report to this anonymous fetch.
                  <a
                    key={item.id}
                    href={evidenceFileUrl(item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card"
                    title={dictionary.reportDetail.viewLarger}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- API-hosted file, not a local/optimizable asset */}
                    <img
                      src={evidenceFileUrl(item.id)}
                      alt={dictionary.reportDetail.fileAlt}
                      style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'block' }}
                    />
                  </a>
                ) : (
                  <div key={item.id} className="card row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <span className="muted">{dictionary.evidenceTypes[item.type as 'TX_HASH' | 'WALLET_ADDRESS' | 'LINK'] ?? item.type}</span>{' '}
                      {item.type === 'LINK' && item.value && isSafeHttpUrl(item.value) ? (
                        <a href={item.value} target="_blank" rel="ugc nofollow noopener noreferrer">
                          {item.value}
                        </a>
                      ) : (
                        <span className={item.type === 'TX_HASH' || item.type === 'WALLET_ADDRESS' ? 'mono' : undefined}>
                          {item.value}
                        </span>
                      )}
                    </span>
                    {item.type === 'TX_HASH' || item.type === 'WALLET_ADDRESS' ? (
                      <Pill variant={item.verifiedOnChain ? 'ok' : 'ne'}>
                        {item.verifiedOnChain ? dictionary.reportDetail.chainVerifiedLabel : dictionary.reportDetail.notVerifiedLabel}
                      </Pill>
                    ) : null}
                  </div>
                ),
              )
            )}
          </div>

          <div className="stack">
            <h2>{dictionary.reportDetail.responsesTitle}</h2>
            {responses.length === 0 ? (
              <p className="muted">{dictionary.reportDetail.noResponses}</p>
            ) : (
              responses.map((response) => (
                <div key={response.id} className="card stack">
                  {response.isDispute ? <Pill variant="wa">{dictionary.reportDetail.disputedBadge}</Pill> : null}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{response.body}</p>
                  <span className="muted">{formatDate(response.createdAt, locale)}</span>
                </div>
              ))
            )}
          </div>

          <div className="stack">
            <h2>{dictionary.reportDetail.commentsTitle}</h2>
            {/* No ReportComment API yet — show the honest empty state only. */}
            <p className="muted">{dictionary.reportDetail.noComments}</p>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h2>{dictionary.reportDetail.timelineTitle}</h2>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">{dictionary.reportDetail.timelineCreated}</span>
              <span>{formatDate(report.createdAt, locale)}</span>
            </div>
            {report.publishedAt ? (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">{dictionary.reportDetail.timelinePublished}</span>
                <span>{formatDate(report.publishedAt, locale)}</span>
              </div>
            ) : null}
            {report.resolvedAt ? (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">{dictionary.reportDetail.timelineResolved}</span>
                <span>{formatDate(report.resolvedAt, locale)}</span>
              </div>
            ) : null}
          </div>

          {entity ? (
            <div className="card stack">
              <h2>{dictionary.entityDetail.scoreTitle}</h2>
              {!riskScore || riskScore.score === null ? (
                <p className="muted">{dictionary.entityDetail.insufficientData}</p>
              ) : (
                <div className="stack">
                  <RiskMeter score={riskScore.score} sm />
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="numeric">{riskScore.score}/100</span>
                    <Pill variant={riskScore.level === 'CRITICAL_SIGNAL' ? 'co' : 'wa'}>{dictionary.riskLevels[riskScore.level]}</Pill>
                  </div>
                </div>
              )}
              <Link href={`/${locale}/entities/${entity.slug}`} className="muted">
                {entity.name}
              </Link>
            </div>
          ) : null}

          <ReportNoticeForm reportId={report.id} dictionary={dictionary} />
        </div>
      </div>
    </div>
  );
}
