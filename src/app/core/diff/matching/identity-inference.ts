import { CandidateStats, IdentityInference, JsonObject, JsonValue } from '../../models/diff.models';

type FlatRow = Map<string, JsonValue>;

const ID_TOKENS = new Set(['id', 'uuid', 'guid', 'key', 'pk', 'sku']);
const STRONG_TOKENS = new Set(['code', 'email', 'username', 'number', 'reference']);
const VOLATILE_TOKENS = new Set(['timestamp', 'updated', 'modified', 'created', 'price', 'amount', 'quantity', 'count', 'status', 'version', 'time', 'date']);

export function inferIdentity(left: JsonObject[], right: JsonObject[]): IdentityInference {
  const leftFlat = left.map(row => flattenScalarPaths(row));
  const rightFlat = right.map(row => flattenScalarPaths(row));
  const candidates = discoverCandidatePaths(leftFlat, rightFlat);

  const singles = candidates
    .map(path => scoreCandidate([path], leftFlat, rightFlat))
    .filter(Boolean) as CandidateStats[];

  singles.sort((a, b) => b.score - a.score);

  const viable = singles
    .filter(c => c.completeness >= 0.8 && average(c.uniquenessA, c.uniquenessB) >= 0.2)
    .slice(0, 10);

  const composites: CandidateStats[] = [];
  const bestSingle = singles[0];
  const singleIsIdentityQuality = !!bestSingle && bestSingle.score >= 0.9 && bestSingle.uniquenessA >= 0.95 && bestSingle.uniquenessB >= 0.95;
  if (!singleIsIdentityQuality) {
    for (let i = 0; i < viable.length; i++) {
      for (let j = i + 1; j < viable.length; j++) {
        const combo = scoreCandidate([...viable[i].paths, ...viable[j].paths], leftFlat, rightFlat, 0.03);
        if (combo) composites.push(combo);
      }
    }
  }

  const all = [...singles, ...composites].sort((a, b) => b.score - a.score);
  const best = all[0];
  const second = all[1];
  const margin = best && second ? best.score - second.score : best ? best.score : 0;
  const ambiguous = !!best && !!second && best.score >= 0.75 && second.score >= 0.75 && margin < 0.05;

  let confidence: IdentityInference['confidence'] = 'low';
  if (best) {
    const uniqueEnough = best.uniquenessA >= 0.95 && best.uniquenessB >= 0.95;
    if (best.score >= 0.9 && margin >= 0.05 && best.matchCoverage >= 0.7 && uniqueEnough) confidence = 'high';
    else if (best.score >= 0.75 && margin >= 0.03 && best.matchCoverage >= 0.5 && uniqueEnough) confidence = 'medium';
  }

  return {
    best,
    alternatives: all.slice(1, 6),
    confidence,
    autoApply: confidence === 'high' && !ambiguous,
    ambiguous
  };
}

function flattenScalarPaths(row: JsonObject, prefix = '', out = new Map<string, JsonValue>()): FlatRow {
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isScalar(value)) out.set(path, value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) flattenScalarPaths(value as JsonObject, path, out);
  }
  return out;
}

function discoverCandidatePaths(left: FlatRow[], right: FlatRow[]): string[] {
  const paths = new Set<string>();
  [...left, ...right].forEach(row => row.forEach((_v, path) => paths.add(path)));
  return [...paths];
}

function scoreCandidate(paths: string[], left: FlatRow[], right: FlatRow[], complexityPenalty = 0): CandidateStats | undefined {
  const leftValues = buildKeyValues(paths, left);
  const rightValues = buildKeyValues(paths, right);
  if (!leftValues.length && !rightValues.length) return undefined;

  const completenessA = ratio(leftValues.length, left.length);
  const completenessB = ratio(rightValues.length, right.length);
  const completeness = average(completenessA, completenessB);
  const uniquenessA = uniqueRatio(leftValues);
  const uniquenessB = uniqueRatio(rightValues);
  const overlap = jaccard(leftValues, rightValues);
  const matchCoverage = matchedCoverage(leftValues, rightValues, Math.max(left.length, right.length));
  const typeConsistency = average(typeConsistencyFor(paths, left), typeConsistencyFor(paths, right));
  const nameHint = Math.max(...paths.map(nameHintFor));
  const volatilityPenalty = Math.max(...paths.map(volatilityFor));

  const score = clamp(
    0.25 * average(uniquenessA, uniquenessB) +
    0.25 * matchCoverage +
    0.15 * overlap +
    0.15 * completeness +
    0.10 * typeConsistency +
    0.10 * nameHint -
    0.12 * volatilityPenalty -
    complexityPenalty * Math.max(0, paths.length - 1)
  );

  return { paths, uniquenessA, uniquenessB, completenessA, completenessB, completeness, overlap, matchCoverage, typeConsistency, nameHint, volatilityPenalty, score };
}

function buildKeyValues(paths: string[], rows: FlatRow[]): string[] {
  const values: string[] = [];
  for (const row of rows) {
    const parts: string[] = [];
    let complete = true;
    for (const path of paths) {
      const value = row.get(path);
      if (value === null || value === undefined || value === '') { complete = false; break; }
      parts.push(normalize(value));
    }
    if (complete) values.push(parts.join('\u001f'));
  }
  return values;
}

function nameHintFor(path: string): number {
  const tokens = tokenize(path.split('.').at(-1) ?? path);
  if (tokens.some(t => ID_TOKENS.has(t))) return 1;
  if (tokens.some(t => STRONG_TOKENS.has(t))) return 0.7;
  if (tokens.includes('name')) return 0.35;
  return 0;
}

function volatilityFor(path: string): number {
  const tokens = tokenize(path);
  return tokens.some(t => VOLATILE_TOKENS.has(t)) ? 1 : 0;
}

function tokenize(value: string): string[] {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
}

function typeConsistencyFor(paths: string[], rows: FlatRow[]): number {
  if (!rows.length) return 1;
  const perPath = paths.map(path => {
    const types = rows.map(r => r.get(path)).filter(v => v !== undefined && v !== null).map(v => typeof v);
    if (!types.length) return 0;
    const counts = new Map<string, number>();
    types.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1));
    return Math.max(...counts.values()) / types.length;
  });
  return perPath.reduce((a, b) => a + b, 0) / perPath.length;
}

function matchedCoverage(a: string[], b: string[], denominator: number): number {
  if (!denominator) return 0;
  const bSet = new Set(b);
  return a.filter(v => bSet.has(v)).length / denominator;
}

function jaccard(a: string[], b: string[]): number {
  const as = new Set(a), bs = new Set(b);
  const union = new Set([...as, ...bs]);
  if (!union.size) return 0;
  let intersection = 0;
  as.forEach(v => { if (bs.has(v)) intersection++; });
  return intersection / union.size;
}

function uniqueRatio(values: string[]): number { return values.length ? new Set(values).size / values.length : 0; }
function ratio(a: number, b: number): number { return b ? a / b : 0; }
function average(a: number, b: number): number { return (a + b) / 2; }
function clamp(v: number): number { return Math.max(0, Math.min(1, v)); }
function normalize(v: JsonValue): string { return typeof v === 'string' ? v.trim() : JSON.stringify(v); }
function isScalar(v: JsonValue): boolean { return v === null || ['string', 'number', 'boolean'].includes(typeof v); }

export function readPath(row: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = row;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as JsonObject)[part];
  }
  return current;
}
