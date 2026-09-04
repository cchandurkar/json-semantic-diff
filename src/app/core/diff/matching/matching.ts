import { ArrayMatchAnalysis, ArrayMatchOutcome, JsonObject, JsonValue } from '../../models/diff.models';
import { PathSegment, identitySegment, indexSegment, stableValue } from '../path';
import { inferIdentity, readPath } from './identity-inference';

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
export function matchArrays(left: JsonValue[], right: JsonValue[], path: string): ArrayMatchResult {
  const analysis = selectArrayStrategy(left, right, path);

  if (analysis.strategy === 'identity' && analysis.keyPaths) {
    const pairs = pairByIdentity(left as JsonObject[], right as JsonObject[], analysis.keyPaths);
    if (pairs.length) {
      analysis.reordered = pairs.some(p => p.leftIndex !== undefined && p.rightIndex !== undefined && p.leftIndex !== p.rightIndex);
      return { analysis, pairs };
    }
  }

  return { analysis, pairs: pairByPosition(left, right) };
}

/** Chooses the strategy and records why, without pairing anything. */
export function selectArrayStrategy(left: JsonValue[], right: JsonValue[], path: string): ArrayMatchAnalysis {
  const base = { path, leftCount: left.length, rightCount: right.length, reordered: false };

  const objectArrays = left.every(isObject) && right.every(isObject) && (left.length > 0 || right.length > 0);
  if (!objectArrays || !left.length || !right.length) {
    return { ...base, strategy: 'position', outcome: 'positional', confidence: 'low' };
  }

  const inference = inferIdentity(left as JsonObject[], right as JsonObject[]);
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

function rejectedOutcome(inference: { ambiguous: boolean; best?: unknown }): ArrayMatchOutcome {
  if (inference.ambiguous) return 'ambiguous';
  return inference.best ? 'below-threshold' : 'no-candidates';
}

/**
 * Pairs records by their composite identity key. Unmatched records on either
 * side yield a pair with only one populated value. Pairs are emitted in sorted
 * key order, so physical array ordering never affects the result.
 */
export function pairByIdentity(left: JsonObject[], right: JsonObject[], keyPaths: string[]): MatchedPair[] {
  const valuesOf = (row: JsonObject) => keyPaths.map(p => stableValue(readPath(row, p)));
  const keyOf = (row: JsonObject) => valuesOf(row).join('|');

  const leftMap = new Map(left.map((row, i) => [keyOf(row), { row, i }]));
  const rightMap = new Map(right.map((row, i) => [keyOf(row), { row, i }]));
  // Retained separately so a key value that itself contains the '|' joiner still
  // round-trips into the correct per-path segment values.
  const valuesByKey = new Map<string, string[]>();
  for (const row of [...left, ...right]) valuesByKey.set(keyOf(row), valuesOf(row));
  const keys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();

  return keys.map(key => {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    return {
      segment: identitySegment(keyPaths, valuesByKey.get(key) ?? [key]),
      left: l?.row,
      right: r?.row,
      leftIndex: l?.i,
      rightIndex: r?.i
    };
  });
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
