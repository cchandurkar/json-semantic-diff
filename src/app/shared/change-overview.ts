import { DiffNode, JsonObject } from '../core/diff';

export interface ChangeAreaNode {
  nodeId: string;
  path: string;
  label: string;
  count: number;
  children: ChangeAreaNode[];
}

/**
 * Builds a navigable "Changes by Area" outline from the canonical diff tree.
 * Only nodes with `hasChanges` are included (this automatically excludes
 * unchanged AND ignored subtrees, since ignored nodes are stored with
 * `hasChanges: false`). Children are reordered into natural document order -
 * see `naturalOrderChildren` below for why this is necessary.
 */
export function buildChangeOverview(root: DiffNode): ChangeAreaNode[] {
  return naturalOrderChildren(root)
    .map(toAreaNode)
    .filter((area): area is ChangeAreaNode => area !== null);
}

function toAreaNode(node: DiffNode): ChangeAreaNode | null {
  if (!node.hasChanges) return null;
  const children = naturalOrderChildren(node).map(toAreaNode).filter((a): a is ChangeAreaNode => a !== null);
  return { nodeId: node.id, path: node.path, label: node.label, count: countChangedLeaves(node), children };
}

/**
 * Mirrors the core's own leaf-only `summary` walk: a subtree's count is the
 * number of leaf descendants whose `changeKind !== 'unchanged'`.
 */
function countChangedLeaves(node: DiffNode): number {
  if (!node.children?.length) return node.hasChanges ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countChangedLeaves(child), 0);
}

/**
 * The canonical tree sorts object keys ALPHABETICALLY and identity-matched
 * array elements BY KEY, for deterministic diffing - neither reflects the
 * original document's order. This reorders a node's children back into
 * natural order using data already present on the canonical model:
 *  - array nodes: sort by original position (`leftIndex` if present, else
 *    `rightIndex` - an added element only has `rightIndex`).
 *  - object nodes: `node.left`/`node.right` hold the FULL object value at
 *    that path; `normalize()` rebuilds objects via `Object.entries`, which
 *    preserves insertion order, so `Object.keys(node.left ?? node.right)`
 *    gives the true source key order even though `node.children` does not.
 */
function naturalOrderChildren(node: DiffNode): DiffNode[] {
  const children = node.children ?? [];
  if (!children.length) return [];
  if (node.nodeKind === 'array') {
    return [...children].sort((a, b) => (a.leftIndex ?? a.rightIndex ?? Infinity) - (b.leftIndex ?? b.rightIndex ?? Infinity));
  }
  if (node.nodeKind === 'object') {
    const value = (node.left ?? node.right) as JsonObject | undefined;
    const order = value ? Object.keys(value) : [];
    const indexOf = (label: string) => { const i = order.indexOf(label); return i === -1 ? order.length : i; };
    return [...children].sort((a, b) => indexOf(a.label) - indexOf(b.label));
  }
  return children;
}
