/**
 * Theme persistence and resolution. The storage key is duplicated by the inline script in
 * `src/index.html`, which applies the saved theme before first paint so a
 * reload never flashes light before Angular boots. Change both together.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type Theme = ThemePreference;

export const THEME_STORAGE_KEY = 'json-semantic-diff.theme';

/** Narrows a stored value to a ThemePreference; anything else counts as "no saved choice". */
export function parseTheme(value: string | null): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

/**
 * Returns null when storage is unavailable (private mode, blocked cookies, or
 * a non-browser environment such as build-time prerendering, where
 * `localStorage` does not exist at all).
 */
export function readStoredTheme(): ThemePreference | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Storage failures are non-fatal: the theme still applies for this session. */
export function storeTheme(theme: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignored */
  }
}

/**
 * Resolves a preference ('system' | 'light' | 'dark') to an actual appearance ('light' | 'dark').
 * In SSR / non-browser environments or when matchMedia is unavailable, falls back to 'light'.
 */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset['theme'] = resolved;
  }
  return resolved;
}
