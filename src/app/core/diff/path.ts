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
  | { kind: 'identity'; keyPaths: string[]; values: string[] };

export const ROOT_SEGMENT: PathSegment = { kind: 'root' };

export function keySegment(name: string): PathSegment {
  return { kind: 'key', name };
}

export function indexSegment(index: number): PathSegment {
  return { kind: 'index', index };
}

export function identitySegment(keyPaths: string[], values: string[]): PathSegment {
  return { kind: 'identity', keyPaths, values };
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
    case 'identity': return `${parent}[${segment.values.join('|')}]`;
  }
}

/**
 * Stable identity string. Identical to `appendPath` except identity segments
 * spell out which paths produced the key, e.g. `$.users[userId=102].status`.
 */
export function appendId(parent: string, segment: PathSegment): string {
  if (segment.kind !== 'identity') return appendPath(parent, segment);
  const body = segment.keyPaths.map((keyPath, i) => `${keyPath}=${segment.values[i]}`).join(';');
  return `${parent}[${body}]`;
}

/** Short display label for a segment. */
export function segmentLabel(segment: PathSegment): string {
  switch (segment.kind) {
    case 'root': return 'root';
    case 'key': return segment.name;
    case 'index': return `[${segment.index}]`;
    case 'identity': return `[${segment.keyPaths.join('+')}=${segment.values.join('|')}]`;
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
