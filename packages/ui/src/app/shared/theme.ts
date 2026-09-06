/**
 * Theme persistence. The storage key is duplicated by the inline script in
 * `src/index.html`, which applies the saved theme before first paint so a
 * reload never flashes light before Angular boots. Change both together.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'difflens.theme';

/** Narrows a stored value to a Theme; anything else counts as "no saved choice". */
export function parseTheme(value: string | null): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** Returns null when storage is unavailable (private mode, blocked cookies). */
export function readStoredTheme(): Theme | null {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Storage failures are non-fatal: the theme still applies for this session. */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignored */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}
