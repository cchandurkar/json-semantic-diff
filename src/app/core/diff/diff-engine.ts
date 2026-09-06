import {
  ArrayMatchAnalysis,
  DiffNode,
  DiffNodeKind,
  DiffOptions,
  DiffResult,
  DiffSummary,
  JsonObject,
  JsonValue
} from '../models/diff.models';
import { shouldIgnore } from './ignore/ignore-rules';
import { MatchedPair, matchArrays } from './matching/matching';
import { normalize } from './normalization/normalization';
import { PathSegment, ROOT_SEGMENT, appendId, appendPath, segmentLabel } from './path';

/**
 * Compares two JSON documents and produces the canonical diff result.
 *
 * Framework independent: no Angular, no DOM, no RxJS.
 */
export function diffJson(left: JsonValue, right: JsonValue, options: DiffOptions): DiffResult {
  const started = now();
  const arrays: ArrayMatchAnalysis[] = [];
  const root = compare(left, right, left, right, '', '', ROOT_SEGMENT, options, arrays, {});
  const summary = summarize(root);

  return {
    root,
    summary,
    arrays,
    autoMatchedCount: arrays.filter((a) => a.outcome === 'identity-applied').length,
    uncertainCount: arrays.filter((a) => a.outcome === 'ambiguous' || a.outcome === 'below-threshold' || a.outcome === 'no-candidates')
      .length,
    // Manual decisions outrank inferred ones: if the user pinned something, that
    // is the array they are looking at.
    primaryAnalysis:
      arrays.find((a) => a.outcome === 'manual-key' || a.outcome === 'manual-position') ??
      arrays.find((a) => a.outcome === 'identity-applied') ??
      arrays.find((a) => a.outcome !== 'positional') ??
      arrays[0],
    elapsedMs: Math.round((now() - started) * 10) / 10
  };
}

/** Positional metadata carried down from an array pairing to its element node. */
interface ElementPosition {
  leftIndex?: number;
  rightIndex?: number;
}

function compare(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  // The same two values before normalization ran. Threaded down in parallel so
  // leaves can expose exactly what the user typed without a second traversal.
  rawLeft: JsonValue | undefined,
  rawRight: JsonValue | undefined,
  parentPath: string,
  parentId: string,
  segment: PathSegment,
  options: DiffOptions,
  arrays: ArrayMatchAnalysis[],
  position: ElementPosition
): DiffNode {
  const path = appendPath(parentPath, segment);
  const id = appendId(parentId, segment);
  const label = segmentLabel(segment);
  const base = { path, id, label, ...position };
  // Populated on every value-bearing leaf, including the added/removed/type-changed/
  // ignored early returns below, which are leaves normalized one level up.
  const raw = { leftRaw: rawLeft, rightRaw: rawRight };

  // Ignored nodes stay `unchanged` so they never move the summary counts, but they
  // keep both values and are flagged so a renderer can style them differently.
  if (shouldIgnore(path, options.ignorePaths)) {
    return { ...base, ...raw, nodeKind: shapeOf(left ?? right), changeKind: 'unchanged', left, right, hasChanges: false, ignored: true };
  }

  // A value that's `null` on one side and absent on the other is semantically
  // "nothing" on both sides when this option is on. Deliberately does NOT
  // touch cases where both sides already agree (null/null already compares
  // unchanged via deepEqual below; both-undefined cannot occur since keys
  // come from the union of the two objects' own keys).
  if (options.nullEqualsMissing && isNullish(left) && isNullish(right)) {
    return { ...base, ...raw, nodeKind: shapeOf(left ?? right), changeKind: 'unchanged', left, right, hasChanges: false };
  }

  if (left === undefined) return { ...base, rightRaw: rawRight, nodeKind: shapeOf(right), changeKind: 'added', right, hasChanges: true };
  if (right === undefined) return { ...base, leftRaw: rawLeft, nodeKind: shapeOf(left), changeKind: 'removed', left, hasChanges: true };

  const l = normalize(left, options);
  const r = normalize(right, options);
  const lt = jsonType(l),
    rt = jsonType(r);
  if (lt !== rt) return { ...base, ...raw, nodeKind: shapeOf(l), changeKind: 'type-changed', left, right, hasChanges: true };

  if (Array.isArray(l) && Array.isArray(r)) return compareArrays(l, r, rawLeft, rawRight, base, options, arrays);

  if (isObject(l) && isObject(r)) {
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    const rawL = isObject(rawLeft) ? rawLeft : undefined;
    const rawR = isObject(rawRight) ? rawRight : undefined;
    const children = [...keys]
      .sort()
      .map((key) => compare(l[key], r[key], rawL?.[key], rawR?.[key], path, id, { kind: 'key', name: key }, options, arrays, {}));
    return { ...base, nodeKind: 'object', changeKind: aggregateKind(children), left, right, children, hasChanges: anyChanges(children) };
  }

  return {
    ...base,
    ...raw,
    nodeKind: 'scalar',
    changeKind: deepEqual(l, r) ? 'unchanged' : 'modified',
    left,
    right,
    hasChanges: !deepEqual(l, r)
  };
}

function compareArrays(
  left: JsonValue[],
  right: JsonValue[],
  rawLeft: JsonValue | undefined,
  rawRight: JsonValue | undefined,
  base: { path: string; id: string; label: string; leftIndex?: number; rightIndex?: number },
  options: DiffOptions,
  arrays: ArrayMatchAnalysis[]
): DiffNode {
  const { analysis, pairs } = matchArrays(left, right, base.path, options.arrayMatching);
  // Normalization preserves array length, so the pair indices address the raw
  // arrays too - that is how an element recovers its untouched source value.
  const rawL = Array.isArray(rawLeft) ? rawLeft : undefined;
  const rawR = Array.isArray(rawRight) ? rawRight : undefined;
  const children = pairs.map((pair: MatchedPair) =>
    compare(
      pair.left,
      pair.right,
      pair.leftIndex === undefined ? undefined : rawL?.[pair.leftIndex],
      pair.rightIndex === undefined ? undefined : rawR?.[pair.rightIndex],
      base.path,
      base.id,
      pair.segment,
      options,
      arrays,
      { leftIndex: pair.leftIndex, rightIndex: pair.rightIndex }
    )
  );

  arrays.push(analysis);
  return {
    ...base,
    nodeKind: 'array',
    changeKind: aggregateKind(children),
    left,
    right,
    children,
    hasChanges: anyChanges(children),
    arrayMatch: analysis
  };
}

function summarize(root: DiffNode): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, typeChanged: 0, unchanged: 0, totalChanges: 0 };
  const walk = (node: DiffNode) => {
    if (node.children?.length) node.children.forEach(walk);
    else {
      if (node.changeKind === 'added') summary.added++;
      else if (node.changeKind === 'removed') summary.removed++;
      else if (node.changeKind === 'modified') summary.modified++;
      else if (node.changeKind === 'type-changed') summary.typeChanged++;
      else summary.unchanged++;
    }
  };
  walk(root);
  summary.totalChanges = summary.added + summary.removed + summary.modified + summary.typeChanged;
  return summary;
}

/** A parent is modified when any descendant changed, unchanged only when all are. */
function aggregateKind(children: DiffNode[]): DiffNode['changeKind'] {
  return children.every((c) => c.changeKind === 'unchanged') ? 'unchanged' : 'modified';
}
/** Rolls the subtree change flag up during construction, so no second walk is needed. */
function anyChanges(children: DiffNode[]): boolean {
  return children.some((c) => c.hasChanges);
}
function shapeOf(v: JsonValue | undefined): DiffNodeKind {
  return Array.isArray(v) ? 'array' : isObject(v) ? 'object' : 'scalar';
}
function isObject(v: JsonValue | undefined): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function jsonType(v: JsonValue): string {
  return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'object' ? 'object' : typeof v;
}
function deepEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function isNullish(v: JsonValue | undefined): boolean {
  return v === null || v === undefined;
}

/** The only host-provided capability the core needs; falls back to Date for non-browser hosts. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
