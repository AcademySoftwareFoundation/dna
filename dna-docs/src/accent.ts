import {useSyncExternalStore} from 'react';
import {ACCENTS, type AccentName} from '@dna-app/styles/theme';

/**
 * The docs' accent colour. Blue unless a reader has found the easter egg:
 * the Accent Color swatches in the settings guide's demo recolour the whole
 * site, like the app's own setting does the app.
 *
 * The choice lives on <html data-accent> (absent for blue) so custom.css can
 * restyle the site from it, and in localStorage so it survives a reload;
 * docusaurus.config.ts restores it in the page head, before first paint.
 */
export const DEFAULT_ACCENT: AccentName = 'blue';
/** Also read by the head script in docusaurus.config.ts. */
export const ACCENT_STORAGE_KEY = 'dna-docs-accent';
const CHANGE_EVENT = 'dna-docs-accent-change';

const isAccent = (value: unknown): value is AccentName =>
  typeof value === 'string' && value in ACCENTS;

export function getAccent(): AccentName {
  const value = document.documentElement.dataset.accent;
  return isAccent(value) ? value : DEFAULT_ACCENT;
}

export function setAccent(accent: AccentName): void {
  const root = document.documentElement;
  try {
    if (accent === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_STORAGE_KEY);
    else localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // Private browsing: the choice just lasts until the next reload.
  }
  if (accent === DEFAULT_ACCENT) delete root.dataset.accent;
  else root.dataset.accent = accent;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The current accent, re-rendering when it changes. Blue while server-rendering. */
export function useAccent(): AccentName {
  return useSyncExternalStore(subscribe, getAccent, () => DEFAULT_ACCENT);
}
