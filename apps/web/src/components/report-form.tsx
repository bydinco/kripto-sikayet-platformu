'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { apiFetch, apiUploadFile, ApiError } from '../lib/api-client';
import type { ApiEntity, ApiEvidence, ApiReport, ReportCategory } from '../lib/api-models';
import { humanizeEnum } from '../lib/format';
import { isAcceptedImageFile, MAX_FILES, MAX_FILE_SIZE_BYTES } from '../lib/evidence-file-validation';
import { getMissingReportFields, type MissingReportField } from '../lib/report-form-validation';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

// Text/link evidence types this form offers directly; screenshots go
// through the separate file picker below (type SCREENSHOT, server-assigned).
type FormEvidenceType = 'TX_HASH' | 'WALLET_ADDRESS' | 'LINK';

interface EvidenceRow {
  key: string;
  type: FormEvidenceType;
  value: string;
}

interface FileRow {
  key: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface SubmitError {
  message: string;
  existingReportId?: string;
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
  // Set to true by the search input's own onChange (an event handler, not
  // an effect body) and back to false once the matching response lands —
  // only used to avoid flashing "no results" before the first response
  // for the current query has arrived.
  const [entitySearchLoading, setEntitySearchLoading] = useState(false);
  // Tracks the query the latest-fired request is for, so an earlier,
  // slower request that resolves after a newer one can't clobber it with
  // stale results (there's no debounce — every keystroke fires a fetch).
  const latestEntityQueryRef = useRef('');

  const [category, setCategory] = useState<ReportCategory>('OTHER');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lossUsd, setLossUsd] = useState('');
  const [incidentAt, setIncidentAt] = useState('');
  const [evidenceRows, setEvidenceRows] = useState<EvidenceRow[]>([]);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<SubmitError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdReport, setCreatedReport] = useState<ApiReport | null>(null);

  // Revoke every object URL on unmount — removeFileRow revokes its own as
  // files are removed one at a time, this is only the final cleanup. Reads
  // from a ref kept in sync with fileRows so the unmount cleanup sees the
  // latest list, not whatever it was when the effect first ran.
  const fileRowsRef = useRef<FileRow[]>(fileRows);
  useEffect(() => {
    fileRowsRef.current = fileRows;
  }, [fileRows]);
  useEffect(() => {
    return () => {
      for (const row of fileRowsRef.current) URL.revokeObjectURL(row.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const queryAtRequestTime = entityQuery;
    latestEntityQueryRef.current = entityQuery;
    apiFetch<ApiEntity[]>(`/entities${entityQuery ? `?q=${encodeURIComponent(entityQuery)}` : ''}`)
      .then((result) => {
        if (latestEntityQueryRef.current !== queryAtRequestTime) return; // superseded by a newer query
        setEntities(result);
        setEntitySearchLoading(false);
      })
      .catch(() => {
        if (latestEntityQueryRef.current !== queryAtRequestTime) return;
        setEntities([]);
        setEntitySearchLoading(false);
      });
  }, [entityQuery, status]);

  // File-upload status is deliberately NOT part of this — a file error
  // must never block submitting the report itself (see handleSubmit).
  const missingFields = useMemo(
    () => getMissingReportFields({ hasEntity: Boolean(selectedEntity), title, body, consent }),
    [selectedEntity, title, body, consent],
  );
  const canSubmit = missingFields.length === 0;
  const missingFieldLabel: Record<MissingReportField, string> = {
    entity: dictionary.reportForm.missingEntity,
    title: dictionary.reportForm.missingTitle,
    body: dictionary.reportForm.missingBody,
    consent: dictionary.reportForm.missingConsent,
  };

  function addEvidenceRow() {
    setEvidenceRows((rows) => [...rows, { key: crypto.randomUUID(), type: 'LINK', value: '' }]);
  }

  function updateEvidenceRow(key: string, patch: Partial<EvidenceRow>) {
    setEvidenceRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeEvidenceRow(key: string) {
    setEvidenceRows((rows) => rows.filter((row) => row.key !== key));
  }

  function addFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;

    // Computed from the current fileRows read directly (this always runs
    // synchronously from the <input onChange>, never batched/stale), then
    // applied in one setFileRows + one setFileError — not from inside a
    // setFileRows updater, which would call setFileError as a side effect
    // of what's supposed to be a pure updater function.
    const next = [...fileRows];
    let error: string | null = null;
    for (const file of Array.from(selected)) {
      if (next.length >= MAX_FILES) {
        error = dictionary.reportForm.fileCountError;
        break;
      }
      if (!isAcceptedImageFile(file)) {
        error = dictionary.reportForm.fileTypeError;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        error = dictionary.reportForm.fileSizeError;
        continue;
      }
      next.push({ key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: 'pending' });
    }
    setFileRows(next);
    setFileError(error);
  }

  function removeFileRow(key: string) {
    setFileRows((rows) => {
      const row = rows.find((r) => r.key === key);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return rows.filter((r) => r.key !== key);
    });
  }

  async function uploadFileRow(reportId: string, row: FileRow) {
    setFileRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, status: 'uploading', error: undefined } : r)));
    try {
      await apiUploadFile<ApiEvidence>(`/reports/${reportId}/evidence/files`, row.file, accessToken!);
      setFileRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, status: 'done' } : r)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : dictionary.reportForm.fileUploadFailed;
      setFileRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, status: 'error', error: message } : r)));
    }
  }

  async function uploadPendingFiles(reportId: string, rows: FileRow[]) {
    for (const row of rows) {
      if (row.status === 'done') continue;
      await uploadFileRow(reportId, row);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!selectedEntity || !accessToken) return;

    for (const row of evidenceRows) {
      if (row.type === 'LINK' && row.value && !isHttpUrl(row.value)) {
        setError({ message: `${dictionary.evidenceTypes.LINK}: http(s):// ${row.value}` });
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

      // A file-upload failure must not undo report creation — it never
      // throws (see uploadFileRow), so it can't reach the catch below. The
      // success view keeps the file rows visible with a retry button for
      // anything that didn't make it.
      await uploadPendingFiles(report.id, fileRows);

      setCreatedReport(report);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body?.existingReportId) {
        setError({ message: dictionary.reportForm.duplicateError, existingReportId: err.body.existingReportId });
      } else if (err instanceof ApiError && err.status === 429) {
        setError({ message: dictionary.reportForm.rateLimitError });
      } else {
        setError({ message: err instanceof ApiError ? err.message : String(err) });
      }
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
    const failedFiles = fileRows.filter((row) => row.status === 'error');
    return (
      <div className="card stack">
        <p>{dictionary.reportForm.success}</p>
        {failedFiles.length > 0 ? (
          <div className="stack">
            {failedFiles.map((row) => (
              <div key={row.key} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="error-text">
                  {row.file.name}: {row.error}
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void uploadFileRow(createdReport.id, row)}
                >
                  {dictionary.reportForm.fileRetry}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <Link href={`/${locale}/reports/${createdReport.id}`} className="button">
          {dictionary.reportForm.viewReport}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <h1>{dictionary.reportForm.title}</h1>

      <div className="card stack">
        <h2>{dictionary.reportForm.step1Title}</h2>
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
              if (e.target.value) setEntitySearchLoading(true);
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
          {/* Distinct from "nothing searched yet" below — otherwise a
              search with zero matches looks identical to one that was
              never run, and selection looks broken rather than empty. */}
          {!selectedEntity && entityQuery && !entitySearchLoading && entities.length === 0 ? (
            <p className="muted">{dictionary.reportForm.noEntityResults}</p>
          ) : null}
          {!selectedEntity && !entityQuery ? <p className="muted">{dictionary.reportForm.noEntitySelected}</p> : null}
        </div>
      </div>

      <div className="card stack">
        <h2>{dictionary.reportForm.step2Title}</h2>
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
      </div>

      <div className="card stack">
        <h2>{dictionary.reportForm.step3Title}</h2>

        <div className="field">
          <label htmlFor="evidence-files">{dictionary.reportForm.fileFieldLabel}</label>
          <input
            id="evidence-files"
            className="input"
            type="file"
            // Extensions alongside MIME types: some OS file-picker dialogs
            // filter by MIME type using the system's own (sometimes stale
            // or non-standard, e.g. legacy Windows .jpg registrations)
            // association, which can hide .jpg files from the picker
            // entirely if only "image/jpeg" is given.
            accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            disabled={fileRows.length >= MAX_FILES}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="muted" style={{ fontSize: '0.8125rem' }}>{dictionary.reportForm.fileHint}</p>
        </div>

        {fileRows.map((row) => (
          <div key={row.key} className="row" style={{ background: 'var(--s2)', padding: 12, borderRadius: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote/optimizable image */}
            <img
              src={row.previewUrl}
              alt={row.file.name}
              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}
            />
            <span style={{ flex: 1 }}>{row.file.name}</span>
            {row.status === 'uploading' ? <span className="muted">{dictionary.reportForm.fileUploading}</span> : null}
            {row.status === 'error' ? <span className="error-text">{row.error}</span> : null}
            <button
              type="button"
              className="button button-secondary"
              disabled={row.status === 'uploading'}
              onClick={() => removeFileRow(row.key)}
            >
              {dictionary.reportForm.fileRemove}
            </button>
          </div>
        ))}
        {fileError ? <p className="error-text">{fileError}</p> : null}

        {evidenceRows.map((row) => (
          <div key={row.key} className="row" style={{ background: 'var(--s2)', padding: 12, borderRadius: 8 }}>
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
              className={`input${row.type !== 'LINK' ? ' mono' : ''}`}
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

      <label className="row" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        {dictionary.reportForm.consentLabel}
      </label>

      {error ? (
        <p className="error-text">
          {error.message}
          {error.existingReportId ? (
            <>
              {' '}
              <Link href={`/${locale}/reports/${error.existingReportId}`}>{dictionary.reportForm.viewReport}</Link>
            </>
          ) : null}
        </p>
      ) : null}

      {missingFields.length > 0 ? (
        <p className="muted" style={{ fontSize: '0.8125rem' }}>
          {dictionary.reportForm.missingHintPrefix}
          {missingFields.map((field) => missingFieldLabel[field]).join(', ')}
        </p>
      ) : null}

      <button type="submit" className="button" disabled={!canSubmit || submitting}>
        {submitting ? dictionary.reportForm.submitting : dictionary.reportForm.submit}
      </button>
    </form>
  );
}
