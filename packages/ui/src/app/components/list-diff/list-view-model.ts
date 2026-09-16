import { DiffChangeKind, DiffNode, JsonValue } from 'json-semantic-diff';
import { ArrayMatchBadge as SharedArrayMatchBadge, formatArrayMatchBadge } from '../../shared/array-match-badge';
import { formatSemanticPath } from '../../shared/clipboard/diff-clipboard';
import { nodeChain } from '../../shared/node-navigation';
import { DiffSegment, diffText } from '../../shared/text-diff';

/**
 * Pure presentation logic for the List view.
 *
 * Derives a flat list of leaf changes (or all leaves when changesOnly is false),
 * resolving semantic path strings, diff value segments, and containing array-matching badges.
 */

export interface ArrayMatchBadge extends SharedArrayMatchBadge {
  readonly arrayPath: string;
}

export interface ListDiffRow {
  readonly nodeId: string;
  readonly path: string;
  readonly changeKind: DiffChangeKind;
  readonly left: JsonValue | undefined;
  readonly right: JsonValue | undefined;
  readonly leftDisplay: string;
  readonly rightDisplay: string;
  readonly leftSegments: DiffSegment[];
  readonly rightSegments: DiffSegment[];
  readonly marker: string;
  readonly arrayMatch?: ArrayMatchBadge;
  readonly node: DiffNode;
}

/** Determines whether a JSON value is a non-null container (array or object). */
export function isContainer(value: JsonValue | undefined): boolean {
  return value !== null && value !== undefined && typeof value === 'object';
}

/** Formats a JSON value into a concise display string. */
export function displayValue(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value && typeof value === 'object') return `{${Object.keys(value).length} keys}`;
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
}

/** Change marker character: + for added, − for removed, ~ for modified, empty for unchanged. */
export function changeMarker(changeKind: DiffChangeKind): string {
  switch (changeKind) {
    case 'added':
      return '+';
    case 'removed':
      return '−';
    case 'modified':
    case 'type-changed':
      return '~';
    default:
      return '';
  }
}

/**
 * Inspects a node's ancestor chain to find the closest containing array carrying
 * an array-matching decision, formatting the same badge as Tree and Source.
 */
export function resolveArrayMatchBadge(root: DiffNode, nodeId: string): ArrayMatchBadge | undefined {
  const chain = nodeChain(root, nodeId);
  for (let i = chain.length - 2; i >= 0; i--) {
    const ancestor = chain[i];
    if (ancestor.nodeKind === 'array' && ancestor.arrayMatch) {
      const badge = formatArrayMatchBadge(ancestor.arrayMatch);
      if (badge) {
        return {
          ...badge,
          arrayPath: ancestor.path
        };
      }
    }
  }
  return undefined;
}

/**
 * Builds the flat list of path rows from the diff root.
 *
 * When `changesOnly` is true (default), returns only changed leaf nodes.
 * When `changesOnly` is false, returns all leaf nodes in the document.
 */
export function buildListRows(root: DiffNode | null | undefined, changesOnly = true): ListDiffRow[] {
  if (!root) return [];
  const rows: ListDiffRow[] = [];

  const walk = (node: DiffNode) => {
    if (node.children?.length) {
      for (const child of node.children) {
        walk(child);
      }
      return;
    }

    // Root object/array with 0 children is an empty container, not a leaf path
    if (node.path === '$' && (isContainer(node.left) || isContainer(node.right))) {
      return;
    }

    if (changesOnly && node.changeKind === 'unchanged') {
      return;
    }

    const leftDisplay = displayValue(node.left);
    const rightDisplay = displayValue(node.right);
    let leftSegments: DiffSegment[];
    let rightSegments: DiffSegment[];

    if ((node.changeKind === 'modified' || node.changeKind === 'type-changed') && !isContainer(node.left) && !isContainer(node.right)) {
      const diffed = diffText(leftDisplay, rightDisplay);
      leftSegments = diffed.left;
      rightSegments = diffed.right;
    } else {
      leftSegments = [{ text: leftDisplay, changed: false }];
      rightSegments = [{ text: rightDisplay, changed: false }];
    }

    rows.push({
      nodeId: node.id,
      path: formatSemanticPath(node),
      changeKind: node.changeKind,
      left: node.left,
      right: node.right,
      leftDisplay,
      rightDisplay,
      leftSegments,
      rightSegments,
      marker: changeMarker(node.changeKind),
      arrayMatch: resolveArrayMatchBadge(root, node.id),
      node
    });
  };

  walk(root);
  return rows;
}

/** Checks whether a row matches a search query against its path or values. */
export function rowMatchesQuery(row: ListDiffRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return row.path.toLowerCase().includes(q) || row.leftDisplay.toLowerCase().includes(q) || row.rightDisplay.toLowerCase().includes(q);
}

/** Splits text around the first case-insensitive occurrence of query for `<mark>` highlighting. */
export function splitMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  const q = query.trim();
  if (!q || !text) return null;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return null;
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + q.length),
    after: text.slice(index + q.length)
  };
}
