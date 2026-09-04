import { DiffNode } from '../core/diff';

/**
 * Pure node-navigation helpers shared by the Tree and Source renderers.
 *
 * Selection is always keyed on the canonical `DiffNode.id`, never on a line
 * number or an array index, both of which shift as regions expand.
 */

/**
 * Paths of every ancestor of `nodeId`, root first, excluding the node itself.
 *
 * The Tree keys its expansion set on `node.path`, so an externally-arriving
 * selection needs its ancestors expanded. Derived by walking the tree rather
 * than by slicing the path string: identity brackets such as `$.users[102]`
 * make prefix slicing unsafe (`.` and `[` can appear inside a key value).
 */
export function ancestorPaths(root: DiffNode, nodeId: string): string[] {
  const trail: string[] = [];
  const walk = (node: DiffNode, ancestors: string[]): boolean => {
    if (node.id === nodeId) { trail.push(...ancestors); return true; }
    return (node.children ?? []).some(child => walk(child, [...ancestors, node.path]));
  };
  walk(root, []);
  return trail;
}

/** Finds a node by canonical id, or `undefined` when it is not in this tree. */
export function findNodeById(root: DiffNode, nodeId: string): DiffNode | undefined {
  if (root.id === nodeId) return root;
  for (const child of root.children ?? []) {
    const hit = findNodeById(child, nodeId);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Steps through a change list. Wraps at both ends, and starts from the first
 * (or last) entry when nothing is selected or the selection is not a change.
 */
export function stepChange(changes: string[], current: string | null, delta: 1 | -1): string | null {
  if (!changes.length) return null;
  const index = current === null ? -1 : changes.indexOf(current);
  if (index === -1) return delta === 1 ? changes[0] : changes[changes.length - 1];
  return changes[(index + delta + changes.length) % changes.length];
}
