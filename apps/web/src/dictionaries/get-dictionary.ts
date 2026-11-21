import { en } from './en';
import { tr } from './tr';
import type { Dictionary } from './types';
import type { Locale } from '../lib/locale';

const dictionaries: Record<Locale, Dictionary> = { en, tr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
