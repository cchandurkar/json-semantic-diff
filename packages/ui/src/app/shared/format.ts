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

/** Strips the `$` root prefix from a JSON path for display, e.g. `$.users` -> `users`. */
export function displayPath(path: string): string {
  return path.replace(/^\$\.?/, '') || 'root';
}
