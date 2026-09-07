/**
 * Right analysis panel resize width: bounds and storage.
 *
 * Mirrors the pattern in `theme.ts`: reads/writes are try/catch-safe so a
 * blocked or private-mode localStorage never breaks the app, it just falls
 * back to the session-only default.
 */

export const ANALYSIS_PANEL_WIDTH_STORAGE_KEY = 'json-semantic-diff.analysisPanelWidth';
export const ANALYSIS_PANEL_DEFAULT_WIDTH = 300;
export const ANALYSIS_PANEL_MIN_WIDTH = 260;
export const ANALYSIS_PANEL_MAX_WIDTH = 480;

/** Clamps a candidate width into [min, max] inclusive. */
export function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Narrows a stored value to a finite width; anything else counts as "no saved choice". */
export function parsePanelWidth(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Returns null when storage is unavailable (private mode, blocked cookies, or
 * a non-browser environment such as build-time prerendering) or empty.
 */
export function readStoredAnalysisPanelWidth(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parsePanelWidth(localStorage.getItem(ANALYSIS_PANEL_WIDTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Storage failures are non-fatal: the width still applies for this session. */
export function storeAnalysisPanelWidth(width: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ANALYSIS_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    /* ignored */
  }
}
