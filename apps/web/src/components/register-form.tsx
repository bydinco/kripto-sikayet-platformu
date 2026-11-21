'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api-client';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

export function RegisterForm({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const { register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, handle);
      const next = searchParams.get('next');
      router.push(next && next.startsWith(`/${locale}/`) ? next : `/${locale}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack card" style={{ maxWidth: 420 }}>
      <h1>{dictionary.auth.registerTitle}</h1>
      <div className="field">
        <label htmlFor="handle">{dictionary.auth.handleLabel}</label>
        <input
          id="handle"
          className="input"
          type="text"
          required
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="email">{dictionary.auth.emailLabel}</label>
        <input
          id="email"
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">{dictionary.auth.passwordLabel}</label>
        <input
          id="password"
          className="input"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button type="submit" className="button" disabled={submitting}>
        {dictionary.auth.submitRegister}
      </button>
      <a href={`/${locale}/login`} className="muted">
        {dictionary.auth.haveAccount}
      </a>
    </form>
  );
}
