import { DiffNode, DiffResult, JsonObject, JsonValue } from 'json-semantic-diff';
import { SourceCell, SourceDiffRow, SourceRole } from './source-model';

/**
 * Turns a canonical `DiffResult` into side-by-side source rows.
 *
 * One DFS over the diff tree, mirroring the engine's own child order, so rows
 * come out in node order. Nothing is recomputed: no inference, no matching, no
 * normalization, no ignore evaluation. Values come from `leftRaw ?? left` so the
 * panes show exactly what the user typed rather than the normalized comparison
 * form.
 */
export function emitSourceRows(result: DiffResult): SourceDiffRow[] {
  const builder = new RowBuilder();
  emitNode(result.root, builder, { depth: 0, commaLeft: false, commaRight: false });
  return builder.rows;
}

/** A line before line numbers are assigned. */
interface LineDraft {
  depth: number;
  role: SourceRole;
  text: string;
  key?: string;
  value?: string;
}

interface EmitContext {
  depth: number;
  /** Object-property key of this node, absent for array elements and the root. */
  keyName?: string;
  commaLeft: boolean;
  commaRight: boolean;
  /** Propagated from the parent array so element rows can carry the reorder flag. */
  reordered?: boolean;
}

class RowBuilder {
  readonly rows: SourceDiffRow[] = [];
  private leftLine = 0;
  private rightLine = 0;

  /** A row consumes a left number iff it has a left cell, and likewise for the right. */
  push(row: Omit<SourceDiffRow, 'left' | 'right'>, left?: Omit<SourceCell, 'lineNumber'>, right?: Omit<SourceCell, 'lineNumber'>): void {
    this.rows.push({
      ...row,
      ...(left ? { left: { ...left, lineNumber: ++this.leftLine } } : {}),
      ...(right ? { right: { ...right, lineNumber: ++this.rightLine } } : {})
    });
  }
}

/** `added` nodes have no left side; `removed` nodes have no right side. */
function presentLeft(node: DiffNode): boolean {
  return node.changeKind !== 'added';
}
function presentRight(node: DiffNode): boolean {
  return node.changeKind !== 'removed';
}

function emitNode(node: DiffNode, builder: RowBuilder, ctx: EmitContext): void {
  // `children` is defined (possibly empty) exactly for paired containers. The
  // added/removed/type-changed/ignored early returns in the engine are all leaves.
  if (node.children) emitContainer(node, builder, ctx);
  else emitLeaf(node, builder, ctx);
}

function emitContainer(node: DiffNode, builder: RowBuilder, ctx: EmitContext): void {
  const children = node.children ?? [];
  const isArray = node.nodeKind === 'array';
  const prefix = keyPrefix(ctx.keyName);
  const openText = `${prefix}${isArray ? '[' : '{'}`;
  const reordered = isArray ? node.arrayMatch?.reordered : ctx.reordered;

  builder.push(
    {
      nodeId: node.id,
      role: 'open',
      // Scaffold rows are never a change in themselves; the change lives on a descendant.
      changeKind: 'unchanged',
      depth: ctx.depth,
      ...positionOf(node),
      ...(reordered ? { reordered: true } : {}),
      ...(node.arrayMatch ? { arrayMatch: node.arrayMatch } : {})
    },
    { text: openText, key: prefix || undefined },
    { text: openText, key: prefix || undefined }
  );

  // Trailing commas are decided per side: the last element PRESENT on that side
  // gets none. A child missing from one side shifts only that side's boundary.
  const lastLeft = lastIndexWhere(children, presentLeft);
  const lastRight = lastIndexWhere(children, presentRight);

  children.forEach((child, index) => {
    emitNode(child, builder, {
      depth: ctx.depth + 1,
      keyName: isArray ? undefined : child.label,
      commaLeft: presentLeft(child) && index < lastLeft,
      commaRight: presentRight(child) && index < lastRight,
      reordered: isArray ? node.arrayMatch?.reordered : undefined
    });
  });

  const closer = isArray ? ']' : '}';
  builder.push(
    {
      nodeId: node.id,
      role: 'close',
      changeKind: 'unchanged',
      depth: ctx.depth,
      ...positionOf(node)
    },
    { text: `${closer}${ctx.commaLeft ? ',' : ''}` },
    { text: `${closer}${ctx.commaRight ? ',' : ''}` }
  );
}

/**
 * Leaves cover four cases beyond plain scalars: `added`, `removed`,
 * `type-changed` and `ignored`. Those carry whole raw subtrees, which are
 * expanded in full - showing added and removed content is the entire point of
 * the view, and collapsing targets unchanged runs only.
 *
 * Both sides are serialized independently and then zipped, because the two
 * sides of a `type-changed` or `ignored` node can have completely different
 * shapes and line counts.
 */
function emitLeaf(node: DiffNode, builder: RowBuilder, ctx: EmitContext): void {
  const prefix = keyPrefix(ctx.keyName);
  const leftLines = presentLeft(node) ? serialize(prefix, node.leftRaw ?? node.left, ctx.depth, ctx.commaLeft) : [];
  const rightLines = presentRight(node) ? serialize(prefix, node.rightRaw ?? node.right, ctx.depth, ctx.commaRight) : [];

  const shared = {
    nodeId: node.id,
    changeKind: node.changeKind,
    ...positionOf(node),
    ...(ctx.reordered ? { reordered: true } : {}),
    ...(node.ignored ? { ignored: true } : {})
  };

  for (let i = 0; i < Math.max(leftLines.length, rightLines.length); i++) {
    const l = leftLines[i];
    const r = rightLines[i];
    const line = l ?? r;
    if (!line) continue;
    builder.push(
      { ...shared, role: line.role, depth: line.depth },
      l && { text: l.text, key: l.key, value: l.value },
      r && { text: r.text, key: r.key, value: r.value }
    );
  }
}

/**
 * Renders one JSON value into lines. Never stringifies a whole document: each
 * line is built from a key plus an O(1) scalar render.
 */
function serialize(prefix: string, value: JsonValue | undefined, depth: number, comma: boolean): LineDraft[] {
  const tail = comma ? ',' : '';

  if (Array.isArray(value)) {
    const out: LineDraft[] = [{ depth, role: 'open', text: `${prefix}[`, key: prefix || undefined }];
    for (const [i, item] of value.entries()) out.push(...serialize('', item, depth + 1, i < value.length - 1));
    out.push({ depth, role: 'close', text: `]${tail}` });
    return out;
  }

  if (isObject(value)) {
    // Sorted to match the engine's own child ordering, so an expanded raw subtree
    // reads consistently with the paired rows around it.
    const keys = Object.keys(value).sort();
    const out: LineDraft[] = [{ depth, role: 'open', text: `${prefix}{`, key: prefix || undefined }];
    for (const [i, key] of keys.entries()) out.push(...serialize(keyPrefix(key), value[key], depth + 1, i < keys.length - 1));
    out.push({ depth, role: 'close', text: `}${tail}` });
    return out;
  }

  const rendered = render(value);
  return [{ depth, role: 'value', text: `${prefix}${rendered}${tail}`, key: prefix || undefined, value: rendered }];
}

function positionOf(node: DiffNode): { leftIndex?: number; rightIndex?: number } {
  return {
    ...(node.leftIndex !== undefined ? { leftIndex: node.leftIndex } : {}),
    ...(node.rightIndex !== undefined ? { rightIndex: node.rightIndex } : {})
  };
}

function lastIndexWhere(children: DiffNode[], predicate: (node: DiffNode) => boolean): number {
  let last = -1;
  children.forEach((child, i) => {
    if (predicate(child)) last = i;
  });
  return last;
}

function keyPrefix(key?: string): string {
  return key === undefined ? '' : `${JSON.stringify(key)}: `;
}
function render(value: JsonValue | undefined): string {
  return value === undefined ? '' : JSON.stringify(value);
}
function isObject(v: JsonValue | undefined): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * DFS pre-order ids of nodes that represent a real change: changed leaves and
 * whole added/removed subtrees. Aggregate `modified` containers are skipped, so
 * `flattenChanges(root).length === result.summary.totalChanges` - the Source and
 * Tree views can never disagree on the change count. Ignored nodes are
 * `unchanged` and therefore never included.
 */
export function flattenChanges(root: DiffNode): string[] {
  const ids: string[] = [];
  const walk = (node: DiffNode) => {
    if (node.children) {
      node.children.forEach(walk);
      return;
    }
    if (node.changeKind !== 'unchanged') ids.push(node.id);
  };
  walk(root);
  return ids;
}
