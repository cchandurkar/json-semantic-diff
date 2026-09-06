import { ArrayMatchAnalysis, DiffChangeKind } from 'json-semantic-diff';

/**
 * Presentation model for the Source view.
 *
 * This lives outside `core/diff` on purpose: it is renderer-specific formatting,
 * and the core must stay renderer-agnostic (AGENTS.md). Nothing here re-runs
 * inference, matching, normalization or ignore evaluation - it consumes an
 * already-computed `DiffResult`.
 */

/** What a row contributes to the rendered JSON document. */
export type SourceRole =
  /** Opening brace/bracket of a container, e.g. `"users": [`. */
  | 'open'
  /** Closing brace/bracket of a container, e.g. `],`. */
  | 'close'
  /** A scalar line, e.g. `"status": "active",`. */
  | 'value'
  /** Placeholder role for collapsed regions. */
  | 'collapsed';

/** One side of one rendered line. */
export interface SourceCell {
  /** 1-based, counted per side. The two sides diverge across added/removed rows. */
  lineNumber: number;
  /** The finished line WITHOUT indentation; any trailing comma is already baked in. */
  text: string;
  /** Object-property key portion, e.g. `"status": `, split out for intra-line highlighting. */
  key?: string;
  /** Rendered value portion, split out so `modified` can highlight only the value. */
  value?: string;
}

export interface SourceDiffRow {
  /** Canonical `DiffNode.id`. Several rows may share one id (containers, expanded subtrees). */
  nodeId: string;
  role: SourceRole;
  /** `'unchanged'` on scaffold (open/close) and context rows. */
  changeKind: DiffChangeKind;
  /** Indentation level. */
  depth: number;
  /** Absent => the row is `added`; the left gutter renders blank. */
  left?: SourceCell;
  /** Absent => the row is `removed`; the right gutter renders blank. */
  right?: SourceCell;
  /** For array-element rows: the element's true position in the ORIGINAL left array. */
  leftIndex?: number;
  rightIndex?: number;
  /** Set on element rows, and on the array's own `open` row, when the array was reordered. */
  reordered?: boolean;
  /** Dimmed, never highlighted, never counted. */
  ignored?: boolean;
  /**
   * Present on an array's `open` row. A direct reference to the core analysis, so
   * the "Matched by userId · 97%" affordance reuses core data instead of copying it.
   */
  arrayMatch?: ArrayMatchAnalysis;
}

/**
 * Changes-only output. Collapsed regions are lazy: `rows()` is a memoized thunk
 * so a large hidden run costs nothing until the user expands it.
 *
 * NOTE: this deliberately diverges from the Tree, which today shows zero
 * unchanged context. Source keeps K lines around each change because a source
 * pane without surrounding context is unreadable.
 */
export type SourceSegment =
  | { kind: 'rows'; rows: SourceDiffRow[] }
  | {
      kind: 'collapsed';
      /**
       * Canonical id of the FIRST HIDDEN node in the run. Deliberately not a line
       * number or array index: those shift when a neighbouring region expands.
       */
      key: string;
      hiddenLines: number;
      fromNodeId: string;
      toNodeId: string;
      rows: () => SourceDiffRow[];
    };
