'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { apiFetch, ApiError } from '../lib/api-client';
import type { ApiEntity, ApiReport, ReportCategory } from '../lib/api-models';
import { humanizeEnum } from '../lib/format';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

// File-upload evidence types (SCREENSHOT/DOCUMENT/...) aren't supported by
// this form yet, so only these three are offered.
type FormEvidenceType = 'TX_HASH' | 'WALLET_ADDRESS' | 'LINK';

interface EvidenceRow {
  key: string;
  type: FormEvidenceType;
  value: string;
}

const EVIDENCE_TYPES: FormEvidenceType[] = ['TX_HASH', 'WALLET_ADDRESS', 'LINK'];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ReportForm({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const { status, accessToken } = useAuth();

  const [entities, setEntities] = useState<ApiEntity[]>([]);
  const [entityQuery, setEntityQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<ApiEntity | null>(null);

  const [category, setCategory] = useState<ReportCategory>('OTHER');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lossUsd, setLossUsd] = useState('');
  const [incidentAt, setIncidentAt] = useState('');
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdReport, setCreatedReport] = useState<ApiReport | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch<ApiEntity[]>(`/entities${entityQuery ? `?q=${encodeURIComponent(entityQuery)}` : ''}`)
      .then(setEntities)
      .catch(() => setEntities([]));
  }, [entityQuery, status]);

  const canSubmit = useMemo(
    () => Boolean(selectedEntity) && title.trim().length > 0 && body.trim().length > 0,
    [selectedEntity, title, body],
  );

  function addEvidenceRow() {
    setEvidenceRows((rows) => [...rows, { key: crypto.randomUUID(), type: 'LINK', value: '' }]);
  }

  function updateEvidenceRow(key: string, patch: Partial<EvidenceRow>) {
    setEvidenceRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeEvidenceRow(key: string) {
    setEvidenceRows((rows) => rows.filter((row) => row.key !== key));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!selectedEntity || !accessToken) return;

    for (const row of evidenceRows) {
      if (row.type === 'LINK' && row.value && !isHttpUrl(row.value)) {
        setError(`${dictionary.evidenceTypes.LINK}: http(s):// ${row.value}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const report = await apiFetch<ApiReport>('/reports', {
        method: 'POST',
        accessToken,
        body: {
          entityId: selectedEntity.id,
          category,
          title,
          body,
          lossUsd: lossUsd ? Number(lossUsd) : undefined,
          incidentAt: incidentAt ? new Date(incidentAt).toISOString() : undefined,
        },
      });

      for (const row of evidenceRows) {
        if (!row.value.trim()) continue;
        await apiFetch('/evidence', {
          method: 'POST',
          accessToken,
          body: { reportId: report.id, type: row.type, value: row.value.trim() },
        });
      }

      setCreatedReport(report);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') return null;

  if (status !== 'authenticated') {
    return (
      <div className="card stack">
        <p>{dictionary.reportForm.loginRequired}</p>
        <Link href={`/${locale}/login?next=/${locale}/reports/new`} className="button">
          {dictionary.reportForm.goToLogin}
        </Link>
      </div>
    );
  }

  if (createdReport) {
    return (
      <div className="card stack">
        <p>{dictionary.reportForm.success}</p>
        <Link href={`/${locale}/reports/${createdReport.id}`} className="button">
          {dictionary.reportForm.viewReport}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <h1>{dictionary.reportForm.title}</h1>

      <div className="field">
        <label htmlFor="entity-search">{dictionary.reportForm.entityLabel}</label>
        <input
          id="entity-search"
          className="input"
          type="text"
          value={selectedEntity ? selectedEntity.name : entityQuery}
          onChange={(e) => {
            setSelectedEntity(null);
            setEntityQuery(e.target.value);
          }}
          placeholder={dictionary.reportForm.entitySearchPlaceholder}
        />
        {!selectedEntity && entityQuery && entities.length > 0 ? (
          <div className="card" style={{ padding: 0 }}>
            {entities.slice(0, 8).map((entity) => (
              <button
                key={entity.id}
                type="button"
                className="button button-secondary"
                style={{ display: 'block', width: '100%', border: 'none', textAlign: 'left' }}
                onClick={() => {
                  setSelectedEntity(entity);
                  setEntityQuery('');
                }}
              >
                {entity.name} <span className="muted">· {humanizeEnum(entity.type)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {!selectedEntity ? <p className="muted">{dictionary.reportForm.noEntitySelected}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="category">{dictionary.reportForm.categoryLabel}</label>
        <select
          id="category"
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value as ReportCategory)}
        >
          {Object.entries(dictionary.categories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="title">{dictionary.reportForm.titleLabel}</label>
        <input id="title" className="input" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="body">{dictionary.reportForm.bodyLabel}</label>
        <textarea
          id="body"
          className="textarea"
          required
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="loss">{dictionary.reportForm.lossLabel}</label>
          <input
            id="loss"
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={lossUsd}
            onChange={(e) => setLossUsd(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="incidentAt">{dictionary.reportForm.incidentDateLabel}</label>
          <input
            id="incidentAt"
            className="input"
            type="date"
            value={incidentAt}
            onChange={(e) => setIncidentAt(e.target.value)}
          />
        </div>
      </div>

      <div className="stack">
        <h2>{dictionary.reportForm.evidenceTitle}</h2>
        {evidenceRows.map((row) => (
          <div key={row.key} className="row card">
            <select
              className="select"
              style={{ maxWidth: 200 }}
              value={row.type}
              onChange={(e) => updateEvidenceRow(row.key, { type: e.target.value as FormEvidenceType })}
            >
              {EVIDENCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {dictionary.evidenceTypes[type]}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="text"
              placeholder={dictionary.reportForm.evidenceValueLabel}
              value={row.value}
              onChange={(e) => updateEvidenceRow(row.key, { value: e.target.value })}
            />
            <button type="button" className="button button-secondary" onClick={() => removeEvidenceRow(row.key)}>
              {dictionary.reportForm.removeEvidence}
            </button>
          </div>
        ))}
        <button type="button" className="button button-secondary" onClick={addEvidenceRow}>
          {dictionary.reportForm.addEvidence}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <button type="submit" className="button" disabled={!canSubmit || submitting}>
        {submitting ? dictionary.reportForm.submitting : dictionary.reportForm.submit}
      </button>
    </form>
  );
}
