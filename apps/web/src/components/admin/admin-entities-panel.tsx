'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { ApiEntity, EntityType } from '../../lib/api-models';
import { RequireRole } from './require-role';
import { humanizeEnum, slugify } from '../../lib/format';
import type { Dictionary } from '../../dictionaries/types';
import type { Locale } from '../../lib/locale';

export const ENTITY_TYPES: EntityType[] = [
  'COIN',
  'EXCHANGE',
  'DEX',
  'WALLET',
  'DEFI_PROTOCOL',
  'NFT_PROJECT',
  'LAUNCHPAD',
  'INFLUENCER',
  'SIGNAL_GROUP',
  'INVESTMENT_PLATFORM',
  'MINING_PLATFORM',
  'AIRDROP',
  'OTHER',
];

function CreateForm({
  accessToken,
  dictionary,
  onCreated,
}: {
  accessToken: string;
  dictionary: Dictionary;
  onCreated: (entity: ApiEntity) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<EntityType>('COIN');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const entity = await apiFetch<ApiEntity>('/entities', {
        method: 'POST',
        accessToken,
        body: { type, slug, name, summary: summary.trim() || undefined },
      });
      onCreated(entity);
      setName('');
      setSlug('');
      setSlugTouched(false);
      setSummary('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack card">
      <h2>{dictionary.admin.entities.createTitle}</h2>
      <div className="field">
        <label htmlFor="name">{dictionary.admin.entities.nameLabel}</label>
        <input id="name" className="input" required value={name} onChange={(e) => handleNameChange(e.target.value)} />
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
        <input
          id="slug"
          className="input"
          required
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
        />
        <span className="muted">{dictionary.admin.entities.slugHint}</span>
      </div>
      <div className="field">
        <label htmlFor="summary">{dictionary.admin.entities.summaryLabel}</label>
        <textarea id="summary" className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button type="submit" className="button" disabled={submitting}>
        {dictionary.admin.entities.createButton}
      </button>
    </form>
  );
}

function PanelBody({ accessToken, locale, dictionary }: { accessToken: string; locale: Locale; dictionary: Dictionary }) {
  const [entities, setEntities] = useState<ApiEntity[] | null>(null);

  useEffect(() => {
    apiFetch<ApiEntity[]>('/entities')
      .then(setEntities)
      .catch(() => setEntities([]));
  }, []);

  return (
    <div className="stack">
      <CreateForm
        accessToken={accessToken}
        dictionary={dictionary}
        onCreated={(entity) => setEntities((current) => [entity, ...(current ?? [])])}
      />
      <h2>{dictionary.admin.entities.title}</h2>
      {entities === null ? null : entities.length === 0 ? (
        <p className="muted">{dictionary.admin.entities.empty}</p>
      ) : (
        entities.map((entity) => (
          <Link key={entity.id} href={`/${locale}/admin/entities/${entity.id}`} className="card" style={{ display: 'block' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{entity.name}</strong>
              {entity.verified ? <span className="badge">✓</span> : null}
            </div>
            <p className="muted">
              {humanizeEnum(entity.type)} · {entity.slug}
            </p>
          </Link>
        ))
      )}
    </div>
  );
}

export function AdminEntitiesPanel({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  return (
    <RequireRole roles={['EDITOR', 'ADMIN']} locale={locale} dictionary={dictionary}>
      {(accessToken) => <PanelBody accessToken={accessToken} locale={locale} dictionary={dictionary} />}
    </RequireRole>
  );
}
