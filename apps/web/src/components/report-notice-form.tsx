'use client';

import { useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../lib/api-client';
import { humanizeEnum } from '../lib/format';
import type { Dictionary } from '../dictionaries/types';

const NOTICE_TYPES = ['REMOVAL_REQUEST', 'CORRECTION_REQUEST', 'COURT_ORDER', 'PRIVACY_REQUEST', 'COPYRIGHT'] as const;
type NoticeType = (typeof NOTICE_TYPES)[number];

export function ReportNoticeForm({ reportId, dictionary }: { reportId: string; dictionary: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NoticeType>('REMOVAL_REQUEST');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [claim, setClaim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>
        {dictionary.reportDetail.reportNoticeButton}
      </button>
    );
  }

  if (submitted) {
    return <p className="muted">{dictionary.reportDetail.noticeSubmitted}</p>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/notices', {
        method: 'POST',
        body: { type, submitterName, submitterEmail, claim, reportId },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack card">
      <div className="field">
        <label htmlFor="notice-type">{dictionary.admin.notices.statusLabel}</label>
        <select id="notice-type" className="select" value={type} onChange={(e) => setType(e.target.value as NoticeType)}>
          {NOTICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanizeEnum(t)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="notice-name">{dictionary.reportDetail.noticeNameLabel}</label>
        <input id="notice-name" className="input" required value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="notice-email">{dictionary.auth.emailLabel}</label>
        <input
          id="notice-email"
          className="input"
          type="email"
          required
          value={submitterEmail}
          onChange={(e) => setSubmitterEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="notice-claim">{dictionary.admin.notices.claimLabel}</label>
        <textarea id="notice-claim" className="textarea" required value={claim} onChange={(e) => setClaim(e.target.value)} />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="row">
        <button type="submit" className="button" disabled={submitting}>
          {dictionary.reportDetail.noticeSubmit}
        </button>
        <button type="button" className="button button-secondary" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>
    </form>
  );
}
