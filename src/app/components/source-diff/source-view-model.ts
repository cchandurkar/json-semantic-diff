import { ArrayMatchAnalysis, DiffChangeKind } from '../../core/diff';
import { SourceDiffRow, SourceSegment } from '../../source';
import { percent } from '../../shared/format';
import { DiffSegment, diffText } from '../../shared/text-diff';

/**
 * Pure presentation logic for the Source view.
 *
 * Kept out of the component so it is testable without TestBed: the component is
 * a thin shell over these functions plus signals and one DOM scroll effect.
 */

/** One entry in the rendered stream: either a real row or a collapsed-region placeholder. */
export type SourceViewItem =
  | { kind: 'row'; row: SourceDiffRow }
  | { kind: 'collapsed'; key: string; hiddenLines: number };

/**
 * Flattens segments into the rendered stream, expanding only the regions whose
 * key is in `expanded`. A collapsed region's `rows()` thunk stays unevaluated
 * until that specific region is opened, so expanding one never costs the others.
 */
export function buildItems(segments: SourceSegment[], expanded: ReadonlySet<string>): SourceViewItem[] {
  return segments.flatMap<SourceViewItem>(segment => {
    if (segment.kind === 'rows') return segment.rows.map(row => ({ kind: 'row', row }));
    if (expanded.has(segment.key)) return segment.rows().map(row => ({ kind: 'row', row }));
    return [{ kind: 'collapsed', key: segment.key, hiddenLines: segment.hiddenLines }];
  });
}

/**
 * Key of the still-collapsed region containing `nodeId`, if any.
 *
 * Only consulted when a selection arrives for a node that is not currently
 * rendered, so the thunks of unrelated regions are touched at most once.
 */
export function collapsedKeyContaining(
  segments: SourceSegment[],
  nodeId: string,
  expanded: ReadonlySet<string>
): string | undefined {
  for (const segment of segments) {
    if (segment.kind !== 'collapsed' || expanded.has(segment.key)) continue;
    if (segment.rows().some(row => row.nodeId === nodeId)) return segment.key;
  }
  return undefined;
}

/** `−` marks the ORIGINAL side of a removal or a modification. */
export function leftMarker(row: SourceDiffRow): string {
  return isRemovedSide(row.changeKind) ? '−' : '';
}

/** `+` marks an addition, `~` the CHANGED side of a modification. */
export function rightMarker(row: SourceDiffRow): string {
  if (row.changeKind === 'added') return '+';
  return row.changeKind === 'modified' || row.changeKind === 'type-changed' ? '~' : '';
}

/** Text equivalent of the colour coding, so colour is never the only signal. */
export function changeLabel(row: SourceDiffRow): string {
  if (row.ignored) return 'Ignored';
  switch (row.changeKind) {
    case 'added': return 'Added';
    case 'removed': return 'Removed';
    case 'modified': return 'Modified';
    case 'type-changed': return 'Type changed';
    default: return '';
  }
}

/**
 * Reads straight off the core analysis carried by the array's open row.
 * No scoring is recomputed and `percent` is the shared UI formatter.
 */
export function matchSummary(match: ArrayMatchAnalysis): string {
  const parts: string[] = [];
  if (match.keyPaths?.length) parts.push(`Matched by ${match.keyPaths.join(' + ')}`);
  const score = match.inference?.best?.score;
  if (score !== undefined) parts.push(percent(score));
  if (match.reordered) parts.push('reordered');
  return parts.join(' · ');
}

export const REORDER_TOOLTIP =
  'Only the presentation order changed so matching records line up. ' +
  'Your original input JSON was not modified. ' +
  'The matching key comes from the existing comparison result.';

export interface CellRender { key?: string; segments: DiffSegment[]; tail: string; }

/**
 * Splits a source cell into key / diffed-value-segments / trailing-comma for
 * rendering, but ONLY when both sides carry a `.value` and the row is a real
 * modification - otherwise falls back to the cell's full `.text` as one
 * unhighlighted segment (byte-identical to today's rendering for
 * open/close/collapsed/added/removed rows).
 */
export function renderCell(row: SourceDiffRow, side: 'left' | 'right'): CellRender | undefined {
  const cell = side === 'left' ? row.left : row.right;
  if (!cell) return undefined;
  const other = side === 'left' ? row.right : row.left;
  const isModification = row.changeKind === 'modified' || row.changeKind === 'type-changed';
  if (!isModification || cell.value === undefined || other?.value === undefined) {
    return { segments: [{ text: cell.text, changed: false }], tail: '' };
  }
  const tail = cell.text.slice((cell.key?.length ?? 0) + cell.value.length);
  const { left, right } = diffText(row.left!.value!, row.right!.value!);
  return { key: cell.key, segments: side === 'left' ? left : right, tail };
}

function isRemovedSide(kind: DiffChangeKind): boolean {
  return kind === 'removed' || kind === 'modified' || kind === 'type-changed';
}
