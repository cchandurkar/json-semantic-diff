import { ArrayMatchAnalysis, ArrayMatchOutcome, ArrayMatchOverride, JsonObject, JsonValue } from '../../models/diff.models';
import { matchesPathPattern } from '../ignore/ignore-rules';
import { PathSegment, identitySegment, indexSegment, stableValue } from '../path';
import { evaluateKey, inferIdentity, readPath } from './identity-inference';

/** One left/right record pairing produced by an array matching strategy. */
export interface MatchedPair {
  segment: PathSegment;
  left?: JsonValue;
  right?: JsonValue;
  /** Original positions in the source arrays; undefined on the side that has no record. */
  leftIndex?: number;
  rightIndex?: number;
}

export interface ArrayMatchResult {
  analysis: ArrayMatchAnalysis;
  pairs: MatchedPair[];
}

/**
 * Decides how two arrays should be matched and produces the element pairing.
 *
 * Identity inference only runs when both sides are non-empty arrays of objects,
 * and is only applied when the inference says it is safe to auto-apply. A
 * rejected inference is still attached so renderers can explain the fallback
 * without rerunning inference.
 */
export function matchArrays(
  left: JsonValue[],
  right: JsonValue[],
  path: string,
  arrayMatching?: Record<string, ArrayMatchOverride>
): ArrayMatchResult {
  const analysis = selectArrayStrategy(left, right, path, arrayMatching);

  if (analysis.strategy === 'identity' && analysis.keyPaths) {
    const l = left as JsonObject[];
    const r = right as JsonObject[];
    const pairs = pairByIdentity(l, r, analysis.keyPaths);
    if (pairs.length) {
      analysis.reordered = pairs.some(p => p.leftIndex !== undefined && p.rightIndex !== undefined && p.leftIndex !== p.rightIndex);
      analysis.duplicateKeyCount = countDuplicateKeyBuckets(l, r, analysis.keyPaths);
      return { analysis, pairs };
    }
  }

  return { analysis, pairs: pairByPosition(left, right) };
}

/**
 * Finds the override governing `path`: exact key first, then wildcard patterns
 * in insertion order, first hit wins. `'auto'` resolves to "no override" so the
 * engine never forks on it.
 */
export function resolveOverride(path: string, arrayMatching?: Record<string, ArrayMatchOverride>): ResolvedOverride | undefined {
  if (!arrayMatching) return undefined;

  const exact = arrayMatching[path];
  if (exact) return exact.strategy === 'auto' ? undefined : { ...exact, strategy: exact.strategy, pattern: path };

  for (const [pattern, override] of Object.entries(arrayMatching)) {
    if (pattern !== path && matchesPathPattern(path, pattern)) {
      return override.strategy === 'auto' ? undefined : { ...override, strategy: override.strategy, pattern };
    }
  }
  return undefined;
}

/** An override that actually applies, carrying the pattern that selected it. */
type ResolvedOverride = { strategy: 'key' | 'position'; fields?: string[]; pattern: string };

/** Chooses the strategy and records why, without pairing anything. */
export function selectArrayStrategy(
  left: JsonValue[],
  right: JsonValue[],
  path: string,
  arrayMatching?: Record<string, ArrayMatchOverride>
): ArrayMatchAnalysis {
  const base = { path, leftCount: left.length, rightCount: right.length, reordered: false };

  const objectArrays = left.every(isObject) && right.every(isObject) && (left.length > 0 || right.length > 0);
  const override = resolveOverride(path, arrayMatching);

  // Inference is hoisted above the override branches on purpose: even when the
  // user has pinned a key, a renderer still wants to show what auto WOULD pick.
  const inference = objectArrays && left.length && right.length
    ? inferIdentity(left as JsonObject[], right as JsonObject[])
    : undefined;

  if (override?.strategy === 'position') {
    return {
      ...base,
      strategy: 'position',
      outcome: 'manual-position',
      confidence: inference?.confidence ?? 'low',
      inference,
      override
    };
  }

  if (override?.strategy === 'key' && override.fields?.length) {
    return {
      ...base,
      strategy: 'identity',
      outcome: 'manual-key',
      confidence: inference?.confidence ?? 'low',
      keyPaths: override.fields,
      inference,
      override,
      keyStats: objectArrays ? evaluateKey(left as JsonObject[], right as JsonObject[], override.fields) : undefined
    };
  }

  if (!objectArrays || !left.length || !right.length || !inference) {
    return { ...base, strategy: 'position', outcome: 'positional', confidence: 'low' };
  }

  if (inference.autoApply && inference.best) {
    return {
      ...base,
      strategy: 'identity',
      outcome: 'identity-applied',
      confidence: inference.confidence,
      keyPaths: inference.best.paths,
      inference
    };
  }

  return { ...base, strategy: 'position', outcome: rejectedOutcome(inference), confidence: inference.confidence, inference };
}

/** Number of key buckets holding more than one record on either side. */
function countDuplicateKeyBuckets(left: JsonObject[], right: JsonObject[], keyPaths: string[]): number {
  const keyOf = (row: JsonObject) => keyPaths.map(p => stableValue(readPath(row, p))).join('|');
  const count = (rows: JsonObject[]) => {
    const tally = new Map<string, number>();
    rows.forEach(row => { const k = keyOf(row); tally.set(k, (tally.get(k) ?? 0) + 1); });
    return tally;
  };
  const l = count(left);
  const r = count(right);
  let duplicates = 0;
  for (const key of new Set([...l.keys(), ...r.keys()])) {
    if ((l.get(key) ?? 0) > 1 || (r.get(key) ?? 0) > 1) duplicates++;
  }
  return duplicates;
}

function rejectedOutcome(inference: { ambiguous: boolean; best?: unknown }): ArrayMatchOutcome {
  if (inference.ambiguous) return 'ambiguous';
  return inference.best ? 'below-threshold' : 'no-candidates';
}

/**
 * Pairs records by their composite identity key.
 *
 * Keys are BUCKETED rather than mapped one-to-one: a `Map` built from all rows
 * would be last-wins, silently dropping every duplicate-keyed record so it
 * showed up as neither a pair nor an add/remove. Within a bucket, records are
 * paired in document order and the longer side spills into single-sided pairs,
 * so no input row is ever lost. Rows whose key value is missing land in the
 * `stableValue(undefined)` bucket and are paired like any other.
 *
 * Buckets are emitted in sorted key order, so physical array ordering never
 * affects the result.
 */
export function pairByIdentity(left: JsonObject[], right: JsonObject[], keyPaths: string[]): MatchedPair[] {
  const valuesOf = (row: JsonObject) => keyPaths.map(p => stableValue(readPath(row, p)));
  const keyOf = (row: JsonObject) => valuesOf(row).join('|');

  const groupL = bucket(left, keyOf);
  const groupR = bucket(right, keyOf);
  // Retained separately so a key value that itself contains the '|' joiner still
  // round-trips into the correct per-path segment values.
  const valuesByKey = new Map<string, string[]>();
  for (const row of [...left, ...right]) valuesByKey.set(keyOf(row), valuesOf(row));

  const keys = [...new Set([...groupL.keys(), ...groupR.keys()])].sort();
  const pairs: MatchedPair[] = [];

  for (const key of keys) {
    const l = groupL.get(key) ?? [];
    const r = groupR.get(key) ?? [];
    const values = valuesByKey.get(key) ?? [key];
    for (let k = 0; k < Math.max(l.length, r.length); k++) {
      pairs.push({
        segment: identitySegment(keyPaths, values, k),
        left: l[k]?.row,
        right: r[k]?.row,
        leftIndex: l[k]?.i,
        rightIndex: r[k]?.i
      });
    }
  }

  return pairs;
}

/** Groups rows by key, preserving document order within each bucket. */
function bucket(rows: JsonObject[], keyOf: (row: JsonObject) => string): Map<string, { row: JsonObject; i: number }[]> {
  const groups = new Map<string, { row: JsonObject; i: number }[]>();
  rows.forEach((row, i) => {
    const key = keyOf(row);
    const existing = groups.get(key);
    if (existing) existing.push({ row, i });
    else groups.set(key, [{ row, i }]);
  });
  return groups;
}

/** Index-for-index pairing, padded to the longer side. */
export function pairByPosition(left: JsonValue[], right: JsonValue[]): MatchedPair[] {
  const len = Math.max(left.length, right.length);
  return Array.from({ length: len }, (_, i) => ({
    segment: indexSegment(i),
    left: left[i],
    right: right[i],
    leftIndex: i < left.length ? i : undefined,
    rightIndex: i < right.length ? i : undefined
  }));
}

function isObject(v: JsonValue | undefined): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
