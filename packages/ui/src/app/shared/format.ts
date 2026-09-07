/**
 * Presentation-only formatting helpers shared by the diff components.
 *
 * These deliberately live outside `core/diff`: they are UI concerns and the
 * core must stay renderer-agnostic.
 */

/** Renders a 0..1 ratio as a rounded percentage, e.g. `0.875` -> `88%`. */
export function percent(value?: number): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

/** Renders a 0..1 ratio as a 1-decimal-place percentage, e.g. `0.875` -> `87.5%`, optionally with a `+` sign. */
export function decimalPercent(value?: number, signed = false): string {
  if (value === undefined || Number.isNaN(value)) return '0.0%';
  const num = value * 100;
  const formatted = Math.abs(num).toFixed(1);
  if (signed && num > 0) return `+${formatted}%`;
  if (num < 0) return `-${formatted}%`;
  return `${formatted}%`;
}

/** Strips the `$` root prefix from a JSON path for display, e.g. `$.users` -> `users`. */
export function displayPath(path: string): string {
  return path.replace(/^\$\.?/, '') || 'root';
}
