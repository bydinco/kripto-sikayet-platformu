'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import type { ApiEntity, ApiEntityLink, EntityType, LinkKind } from '../../lib/api-models';
import { RequireRole } from './require-role';
import { ENTITY_TYPES } from './admin-entities-panel';
import { humanizeEnum } from '../../lib/format';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

const LINK_KINDS: LinkKind[] = [
  'WEBSITE',
  'X',
  'TELEGRAM',
  'DISCORD',
  'YOUTUBE',
  'INSTAGRAM',
  'TIKTOK',
  'GITHUB',
  'DOCS',
  'APP_STORE',
  'PLAY_STORE',
  'OTHER',
];

function LinksSection({
  entityId,
  links,
  accessToken,
  dictionary,
  onChanged,
}: {
  entityId: string;
  links: ApiEntityLink[];
  accessToken: string;
  dictionary: Dictionary;
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<LinkKind>('WEBSITE');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/entities/${entityId}/links`, { method: 'POST', accessToken, body: { kind, url } });
      setUrl('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId: string) {
    await apiFetch(`/entities/${entityId}/links/${linkId}`, { method: 'DELETE', accessToken });
    await onChanged();
  }

  return (
    <div className="stack card">
      <h2>{dictionary.admin.entities.linksTitle}</h2>
      {links.map((link) => (
        <div key={link.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            <span className="muted">{humanizeEnum(link.kind)}</span>{' '}
            {/* Always http(s) — enforced server-side on create — safe as a real anchor. */}
            <a href={link.url} target="_blank" rel="nofollow noopener noreferrer">
              {link.url}
            </a>
          </span>
          <button type="button" className="button button-secondary" onClick={() => void removeLink(link.id)}>
            {dictionary.admin.entities.removeLink}
          </button>
        </div>
      ))}
      <form onSubmit={addLink} className="row">
        <select className="select" style={{ maxWidth: 200 }} value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {humanizeEnum(k)}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="url"
          required
          placeholder={dictionary.admin.entities.linkUrlLabel}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="button button-secondary" disabled={busy}>
          {dictionary.admin.entities.addLink}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

function EditBody({ id, accessToken, dictionary }: { id: string; accessToken: string; dictionary: Dictionary }) {
  const { user } = useAuth();
  const [entity, setEntity] = useState<ApiEntity | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>('COIN');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<ApiEntity>(`/entities/${id}`);
    setEntity(res);
    setName(res.name);
    setType(res.type);
    setSlug(res.slug);
    setSummary(res.summary ?? '');
    setVerified(res.verified);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isAdmin = user?.role === 'ADMIN';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name, type, slug, summary: summary.trim() || undefined };
      if (isAdmin) body.verified = verified;
      const updated = await apiFetch<ApiEntity>(`/entities/${id}`, { method: 'PATCH', accessToken, body });
      setEntity(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!entity) return null;

  return (
    <div className="stack">
      <h1>{dictionary.admin.entities.editTitle}</h1>
      <form onSubmit={handleSubmit} className="stack card">
        <div className="field">
          <label htmlFor="name">{dictionary.admin.entities.nameLabel}</label>
          <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="type">{dictionary.admin.entities.typeLabel}</label>
          <select id="type" className="select" value={type} onChange={(e) => setType(e.target.value as EntityType)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanizeEnum(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="slug">{dictionary.admin.entities.slugLabel}</label>
          <input id="slug" className="input" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="summary">{dictionary.admin.entities.summaryLabel}</label>
          <textarea id="summary" className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="verified" className="row" style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
            <input
              id="verified"
              type="checkbox"
              checked={verified}
              disabled={!isAdmin}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {dictionary.admin.entities.verifiedLabel}
          </label>
          {!isAdmin ? <span className="muted">{dictionary.admin.entities.verifiedAdminOnly}</span> : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit" className="button" disabled={submitting}>
          {dictionary.admin.entities.saveButton}
        </button>
      </form>

      <LinksSection entityId={entity.id} links={entity.links} accessToken={accessToken} dictionary={dictionary} onChanged={load} />
    </div>
  );
}

export function AdminEntityEdit({ id, locale, dictionary }: { id: string; locale: Locale; dictionary: Dictionary }) {
  return (
    <RequireRole roles={['EDITOR', 'ADMIN']} locale={locale} dictionary={dictionary}>
      {(accessToken) => <EditBody id={id} accessToken={accessToken} dictionary={dictionary} />}
    </RequireRole>
  );
}
