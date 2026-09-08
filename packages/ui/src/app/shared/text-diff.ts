export interface DiffSegment {
  text: string;
  changed: boolean;
}

/** Above this many token pairs, the O(n·m) LCS table is skipped entirely. */
const MAX_TOKEN_PRODUCT = 200_000;

/** Memoization cache for diffText: keyed by the serialized token pair so the
 * O(n·m) LCS table is rebuilt only when the actual text changes, not on every
 * change-detection tick. */
const diffTextCache = new Map<string, { left: DiffSegment[]; right: DiffSegment[] }>();

/** Key for cache entry: oldText + NUL + newText (both strings are already
 * normalised by the caller via display(), so the key is deterministic). */
function cacheKey(oldText: string, newText: string): string {
  return oldText + '\0' + newText;
}

/** Caches `result` under `key`, evicting the whole cache once it grows past a
 * bound (simpler than LRU; diff sessions only ever have a bounded number of
 * distinct modified-value pairs visible/scrolled through at once). */
function remember(key: string, result: { left: DiffSegment[]; right: DiffSegment[] }): { left: DiffSegment[]; right: DiffSegment[] } {
  if (diffTextCache.size > 200) diffTextCache.clear();
  diffTextCache.set(key, result);
  return result;
}

/**
 * Word-level diff between two scalar-value strings, GitHub-style: unchanged
 * tokens (words, whitespace runs, individual punctuation chars) stay
 * `changed:false`, diverging runs are `changed:true`. Layered ON TOP of the
 * existing whole-row highlight, never a replacement for it.
 */
export function diffText(oldText: string, newText: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const key = cacheKey(oldText, newText);
  const cached = diffTextCache.get(key);
  if (cached) return cached;

  if (oldText === newText) {
    return remember(key, { left: toSingleSegment(oldText, false), right: toSingleSegment(newText, false) });
  }

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  if (oldTokens.length * newTokens.length > MAX_TOKEN_PRODUCT) {
    return remember(key, { left: toSingleSegment(oldText, true), right: toSingleSegment(newText, true) });
  }

  const ops = lcsOps(oldTokens, newTokens);
  const left = merge(ops.filter((op) => op.kind !== 'insert').map((op) => ({ text: op.text, changed: op.kind !== 'equal' })));
  const right = merge(ops.filter((op) => op.kind !== 'delete').map((op) => ({ text: op.text, changed: op.kind !== 'equal' })));
  return remember(key, { left, right });
}

function toSingleSegment(text: string, changed: boolean): DiffSegment[] {
  return text === '' ? [] : [{ text, changed }];
}

/** Words, whitespace runs, and individual punctuation chars, as separate tokens. */
function tokenize(text: string): string[] {
  return text.match(/\w+|\s+|[^\s\w]/g) ?? [];
}

interface Op {
  kind: 'equal' | 'delete' | 'insert';
  text: string;
}

/** Standard LCS-table backtrack, producing an ordered list of equal/delete/insert ops. */
function lcsOps(oldTokens: string[], newTokens: string[]): Op[] {
  const n = oldTokens.length;
  const m = newTokens.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = oldTokens[i] === newTokens[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      ops.push({ kind: 'equal', text: oldTokens[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: 'delete', text: oldTokens[i] });
      i++;
    } else {
      ops.push({ kind: 'insert', text: newTokens[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: 'delete', text: oldTokens[i] });
    i++;
  }
  while (j < m) {
    ops.push({ kind: 'insert', text: newTokens[j] });
    j++;
  }
  return ops;
}

/** Concatenates adjacent segments sharing the same `changed` flag, to minimize DOM nodes. */
function merge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.changed === seg.changed) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}
