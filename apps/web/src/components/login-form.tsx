'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api-client';
import type { Dictionary } from '../dictionaries/types';
import type { Locale } from '../lib/locale';

export function LoginForm({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
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
      <h1>{dictionary.auth.loginTitle}</h1>
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button type="submit" className="button" disabled={submitting}>
        {dictionary.auth.submitLogin}
      </button>
      <a href={`/${locale}/register`} className="muted">
        {dictionary.auth.noAccount}
      </a>
    </form>
  );
}
