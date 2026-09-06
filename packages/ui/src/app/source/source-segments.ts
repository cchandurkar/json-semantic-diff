import { SourceDiffRow, SourceSegment } from './source-model';

/** Lines of unchanged context kept on each side of a change. */
export const DEFAULT_CONTEXT_LINES = 3;

/**
 * Splits emitted rows into visible runs and collapsed runs for changes-only mode.
 *
 * Rules:
 *  - A changed row is always kept, along with K context lines either side.
 *  - Scaffold (open/close) rows of any container holding a kept row are force-kept,
 *    and a container contributes BOTH braces or neither, so the rendered JSON
 *    always stays balanced.
 *  - Collapsed runs therefore fall strictly between sibling subtrees and can never
 *    split a brace pair.
 *  - `hiddenLines` comes from the run's index range; the `rows()` thunk stays
 *    unevaluated (and is memoized) until the user expands the region.
 */
export function segmentRows(rows: SourceDiffRow[], contextLines: number = DEFAULT_CONTEXT_LINES): SourceSegment[] {
  if (!rows.length) return [];

  const keep = new Array<boolean>(rows.length).fill(false);

  // 1. Changed rows plus their context window. Ignored rows are not changes.
  rows.forEach((row, i) => {
    if (row.changeKind === 'unchanged' || row.ignored) return;
    for (let j = Math.max(0, i - contextLines); j <= Math.min(rows.length - 1, i + contextLines); j++) keep[j] = true;
  });

  // 2. Force-keep the brace pairs enclosing anything kept, innermost outwards.
  const stack: { open: number; kept: boolean }[] = [];
  rows.forEach((row, i) => {
    if (row.role === 'open') {
      stack.push({ open: i, kept: keep[i] });
      return;
    }
    if (row.role === 'close') {
      const frame = stack.pop();
      if (!frame) return;
      if (frame.kept || keep[i]) {
        keep[frame.open] = true;
        keep[i] = true;
        if (stack.length) stack[stack.length - 1].kept = true;
      }
      return;
    }
    if (keep[i] && stack.length) stack[stack.length - 1].kept = true;
  });

  // 3. Group consecutive rows by kept/hidden.
  const segments: SourceSegment[] = [];
  let start = 0;
  while (start < rows.length) {
    const kept = keep[start];
    let end = start;
    while (end + 1 < rows.length && keep[end + 1] === kept) end++;
    segments.push(kept ? { kind: 'rows', rows: rows.slice(start, end + 1) } : collapsed(rows, start, end));
    start = end + 1;
  }
  return segments;
}

function collapsed(rows: SourceDiffRow[], start: number, end: number): SourceSegment {
  let memo: SourceDiffRow[] | undefined;
  return {
    kind: 'collapsed',
    // The first hidden node's canonical id: stable when a neighbouring region expands.
    key: rows[start].nodeId,
    hiddenLines: end - start + 1,
    fromNodeId: rows[start].nodeId,
    toNodeId: rows[end].nodeId,
    rows: () => (memo ??= rows.slice(start, end + 1))
  };
}
