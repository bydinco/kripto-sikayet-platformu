'use client';

import { useEffect } from 'react';
import type { Locale } from '../lib/locale';

// The root <html> element is owned by the true root layout (app/layout.tsx),
// which sits above the [locale] segment and so never receives the locale
// param. This imperatively sets `lang` after mount instead of restructuring
// the layout tree — a one-time DOM attribute write, not state React manages.
export function SetHtmlLang({ lang }: { lang: Locale }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
