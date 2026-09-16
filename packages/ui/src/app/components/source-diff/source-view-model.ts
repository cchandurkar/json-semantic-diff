import { ArrayMatchAnalysis, DiffChangeKind } from 'json-semantic-diff';
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
  { kind: 'row'; row: SourceDiffRow; trackId: string } | { kind: 'collapsed'; key: string; hiddenLines: number; trackId: string };

/**
 * Flattens segments into the rendered stream, expanding only the regions whose
 * key is in `expanded`. A collapsed region's `rows()` thunk stays unevaluated
 * until that specific region is opened, so expanding one never costs the others.
 */
export function buildItems(segments: SourceSegment[], expanded: ReadonlySet<string>): SourceViewItem[] {
  return segments.flatMap<SourceViewItem>((segment) => {
    if (segment.kind === 'rows') return segment.rows.map((row) => ({ kind: 'row', row, trackId: row.nodeId }));
    if (expanded.has(segment.key)) return segment.rows().map((row) => ({ kind: 'row', row, trackId: row.nodeId }));
    return [{ kind: 'collapsed', key: segment.key, hiddenLines: segment.hiddenLines, trackId: segment.key }];
  });
}

/**
 * Key of the still-collapsed region containing `nodeId`, if any.
 *
 * Only consulted when a selection arrives for a node that is not currently
 * rendered, so the thunks of unrelated regions are touched at most once.
 */
export function collapsedKeyContaining(segments: SourceSegment[], nodeId: string, expanded: ReadonlySet<string>): string | undefined {
  for (const segment of segments) {
    if (segment.kind !== 'collapsed' || expanded.has(segment.key)) continue;
    if (segment.rows().some((row) => row.nodeId === nodeId)) return segment.key;
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
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'modified':
      return 'Modified';
    case 'type-changed':
      return 'Type changed';
    default:
      return '';
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

export interface CellRender {
  keyTokens: TokenSpan[];
  segments: RenderSegment[];
  tailTokens: TokenSpan[];
}

export interface RenderSegment {
  changed: boolean;
  tokens: TokenSpan[];
}

export type TokenKind = 'punctuation' | 'key' | 'string' | 'number' | 'boolean' | 'null' | 'whitespace' | 'text';

export interface TokenSpan {
  text: string;
  kind: TokenKind;
}

export function tokenClass(kind: TokenKind): string {
  return `tok-${kind}`;
}

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
    return {
      keyTokens: [],
      segments: [{ changed: false, tokens: tokenizeJsonSnippet(cell.text) }],
      tailTokens: []
    };
  }
  const key = cell.key ?? '';
  const tail = cell.text.slice(key.length + cell.value.length);
  const { left, right } = diffText(row.left!.value!, row.right!.value!);
  return {
    keyTokens: key ? [{ text: key, kind: 'key' }] : [],
    segments: toRenderSegments(side === 'left' ? left : right),
    tailTokens: tokenizeJsonSnippet(tail)
  };
}

function toRenderSegments(segments: DiffSegment[]): RenderSegment[] {
  return segments.map((segment) => ({
    changed: segment.changed,
    tokens: tokenizeJsonSnippet(segment.text)
  }));
}

function tokenizeJsonSnippet(text: string): TokenSpan[] {
  if (!text) return [{ text: '', kind: 'text' }];
  const out: TokenSpan[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (/\s/.test(ch)) {
      const start = i;
      i += 1;
      while (i < text.length && /\s/.test(text[i]!)) i += 1;
      out.push({ text: text.slice(start, i), kind: 'whitespace' });
      continue;
    }

    if (isPunctuation(ch)) {
      out.push({ text: ch, kind: 'punctuation' });
      i += 1;
      continue;
    }

    if (ch === '"') {
      const start = i;
      i += 1;
      let escaped = false;
      while (i < text.length) {
        const current = text[i]!;
        i += 1;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          continue;
        }
        if (current === '"') break;
      }
      const tokenText = text.slice(start, i);
      out.push({ text: tokenText, kind: isObjectKeyToken(text, i) ? 'key' : 'string' });
      continue;
    }

    const numberMatch = text.slice(i).match(NUMBER_TOKEN_RE);
    if (numberMatch) {
      out.push({ text: numberMatch[0], kind: 'number' });
      i += numberMatch[0].length;
      continue;
    }

    const booleanMatch = text.slice(i).match(BOOLEAN_TOKEN_RE);
    if (booleanMatch) {
      out.push({ text: booleanMatch[0], kind: 'boolean' });
      i += booleanMatch[0].length;
      continue;
    }

    const nullMatch = text.slice(i).match(NULL_TOKEN_RE);
    if (nullMatch) {
      out.push({ text: nullMatch[0], kind: 'null' });
      i += nullMatch[0].length;
      continue;
    }

    const start = i;
    i += 1;
    while (i < text.length && !/\s/.test(text[i]!) && !isPunctuation(text[i]!) && text[i] !== '"') {
      i += 1;
    }
    out.push({ text: text.slice(start, i), kind: 'text' });
  }

  return out;
}

const NUMBER_TOKEN_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const BOOLEAN_TOKEN_RE = /^(?:true|false)(?![A-Za-z0-9_])/;
const NULL_TOKEN_RE = /^null(?![A-Za-z0-9_])/;

function isPunctuation(ch: string): boolean {
  return ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',';
}

function isObjectKeyToken(line: string, nextIndex: number): boolean {
  let i = nextIndex;
  while (i < line.length && /\s/.test(line[i]!)) i += 1;
  return line[i] === ':';
}

function isRemovedSide(kind: DiffChangeKind): boolean {
  return kind === 'removed' || kind === 'modified' || kind === 'type-changed';
}

/**
 * Whether this row's own rendered text (either side) visibly contains `query`,
 * case-insensitively.
 *
 * Deliberately NOT "is this row's nodeId one of the search results": a
 * container's open/close scaffold rows share the container's id, and an
 * identity-matched element's id spells out its key=value pairs (e.g.
 * `sku=X;store=Y`) which are never rendered as literal text on the `{`/`}`
 * lines - matching by id there would highlight lines the user can't see any
 * match on.
 */
export function rowMatchesQuery(row: SourceDiffRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (row.left?.text.toLowerCase().includes(q) ?? false) || (row.right?.text.toLowerCase().includes(q) ?? false);
}

/**
 * Splits `text` around every case-insensitive occurrence of `query`, for
 * `<mark>`-highlighting matched substrings inline. Returns the whole text as
 * one non-hit segment when the query is empty or `text` is empty.
 */
export function matchSpans(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (!q || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(qLower, i);
    if (idx === -1) {
      out.push({ text: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), hit: false });
    out.push({ text: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return out;
}
