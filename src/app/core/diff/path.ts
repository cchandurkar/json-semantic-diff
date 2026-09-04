import { JsonValue } from '../models/diff.models';

/**
 * Structured description of one step in a logical diff path.
 *
 * Every string form of a path (the human-facing `path` and the stable `id`) is
 * derived from these segments so the two forms can never drift apart.
 */
export type PathSegment =
  | { kind: 'root' }
  | { kind: 'key'; name: string }
  | { kind: 'index'; index: number }
  /**
   * `occurrence` is the 0-based ordinal of this record within its key bucket.
   * It exists only to disambiguate duplicate keys and is OMITTED from every
   * rendered form when 0, so unique keys serialize exactly as they always have.
   */
  | { kind: 'identity'; keyPaths: string[]; values: string[]; occurrence?: number };

export const ROOT_SEGMENT: PathSegment = { kind: 'root' };

export function keySegment(name: string): PathSegment {
  return { kind: 'key', name };
}

export function indexSegment(index: number): PathSegment {
  return { kind: 'index', index };
}

export function identitySegment(keyPaths: string[], values: string[], occurrence = 0): PathSegment {
  return occurrence > 0 ? { kind: 'identity', keyPaths, values, occurrence } : { kind: 'identity', keyPaths, values };
}

/** `#k` disambiguator for duplicate-keyed records; empty for the first occurrence. */
function occurrenceSuffix(occurrence: number | undefined): string {
  return occurrence ? `#${occurrence}` : '';
}

/**
 * Canonical string used for the `path` field and for ignore-rule matching.
 * Identity segments render value-only, e.g. `$.users[102]`.
 */
export function appendPath(parent: string, segment: PathSegment): string {
  switch (segment.kind) {
    case 'root': return '$';
    case 'key': return `${parent}.${segment.name}`;
    case 'index': return `${parent}[${segment.index}]`;
    case 'identity': return `${parent}[${segment.values.join('|')}${occurrenceSuffix(segment.occurrence)}]`;
  }
}

/**
 * Stable identity string. Identical to `appendPath` except identity segments
 * spell out which paths produced the key, e.g. `$.users[userId=102].status`.
 */
export function appendId(parent: string, segment: PathSegment): string {
  if (segment.kind !== 'identity') return appendPath(parent, segment);
  const body = segment.keyPaths.map((keyPath, i) => `${keyPath}=${segment.values[i]}`).join(';');
  return `${parent}[${body}${occurrenceSuffix(segment.occurrence)}]`;
}

/** Short display label for a segment. */
export function segmentLabel(segment: PathSegment): string {
  switch (segment.kind) {
    case 'root': return 'root';
    case 'key': return segment.name;
    case 'index': return `[${segment.index}]`;
    case 'identity': return `[${segment.keyPaths.join('+')}=${segment.values.join('|')}${occurrenceSuffix(segment.occurrence)}]`;
  }
}

/**
 * Deterministic string form of a single key value.
 *
 * Load-bearing: its output becomes the pairing map key, the bracket body of the
 * serialized path, and the sort key for identity-matched children.
 */
export function stableValue(v: JsonValue | undefined): string {
  return v === undefined ? '∅' : typeof v === 'string' ? v : JSON.stringify(v);
}
