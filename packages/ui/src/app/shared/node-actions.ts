import { ArrayMatchAnalysis, ArrayMatchOverride, DiffOptions, DiffNode } from 'json-semantic-diff';
import { diffNodeActions } from './clipboard/diff-clipboard';
import { nodeChain } from './node-navigation';

/**
 * Pure model behind the Tree/Source context menu.
 *
 * Everything here is a deterministic function over canonical diff nodes, so the
 * menu's visibility rules and the derived matching/ignore strings are unit
 * tested without instantiating a component (more-features.md §13: Angular owns
 * menus, this file owns the decisions the menu renders).
 */

export type NodeActionId =
  | 'copy-path'
  | 'copy-old-value'
  | 'copy-new-value'
  | 'copy-subtree'
  | 'copy-change'
  | 'ignore-path'
  | 'ignore-field-everywhere'
  | 'use-as-key'
  | 'add-to-key';

/** What a Tree/Source row emits when a menu item is chosen. */
export interface NodeActionEvent {
  action: NodeActionId;
  node: DiffNode;
  target?: MatchingTarget;
}

export interface NodeMenuItem {
  id: NodeActionId;
  label: string;
}

export interface NodeMenuGroup {
  /** Rendered as the group heading; also the `aria-label` of the `cdkMenuGroup`. */
  title: string;
  items: NodeMenuItem[];
}

/**
 * Where a clicked scalar sits relative to its containing array of objects,
 * which is everything "Use as matching key" needs (§8).
 */
export interface MatchingTarget {
  /** Canonical path of the array node that owns the override. */
  arrayPath: string;
  /** Path pattern used as the `arrayMatching` map key: ancestor elements generalized. */
  pattern: string;
  /** Element-relative dotted field path, e.g. `sku` or `location.store`. */
  fieldPath: string;
  /** Fields already pinned by an existing override on this array, if any. */
  existingFields?: string[];
  /** True when `fieldPath` is already part of the existing override key. */
  alreadyIncluded: boolean;
}

/**
 * Replaces every array bracket body with `[*]`.
 *
 * Used both for the override map key and for "Ignore this path", so a decision
 * made on one record applies to the whole array rather than to the single row
 * the user happened to right-click. Mirrors the `[*]` wildcard that
 * `matchesPathPattern` already compiles.
 *
 * Shares one limitation with the core matcher: a key value containing a literal
 * `]` would terminate the bracket early. Such values are vanishingly rare and
 * the core has the same behaviour, so the two stay consistent.
 */
export function generalizeElementBrackets(path: string): string {
  return path.replace(/\[[^\]]*\]/g, '[*]');
}

/**
 * Derives the array/field context for a clicked node, or `undefined` when the
 * node is not a scalar field of an object inside an array.
 *
 * Walks root → clicked, then finds the nearest ancestor that is itself an
 * element of an array. Deliberately permitted while the array is still matched
 * positionally: that is exactly when pinning a key is most useful.
 */
export function deriveMatchingTarget(root: DiffNode, clickedId: string): MatchingTarget | undefined {
  const chain = nodeChain(root, clickedId);
  if (chain.length < 3) return undefined;

  const clicked = chain[chain.length - 1];
  if (clicked.nodeKind !== 'scalar') return undefined;

  // Nearest ancestor (or self) whose parent is an array: that is the array element.
  let elementIndex = -1;
  for (let i = chain.length - 1; i > 0; i--) {
    if (chain[i - 1].nodeKind === 'array') {
      elementIndex = i;
      break;
    }
  }
  if (elementIndex <= 0) return undefined;

  const elementNode = chain[elementIndex];
  // Only arrays of objects have named fields that can serve as an identity.
  if (elementNode.nodeKind !== 'object') return undefined;
  // The clicked node must be strictly below the element, never the element itself.
  if (elementIndex === chain.length - 1) return undefined;

  const arrayNode = chain[elementIndex - 1];
  const fieldPath = chain
    .slice(elementIndex + 1)
    .map((node) => node.label)
    .join('.');
  const override = arrayNode.arrayMatch?.override;
  const existingFields = override?.strategy === 'key' ? override.fields : undefined;

  return {
    arrayPath: arrayNode.path,
    pattern: override?.pattern ?? generalizeElementBrackets(arrayNode.path),
    fieldPath,
    existingFields,
    alreadyIncluded: !!existingFields?.includes(fieldPath)
  };
}

/** `Ignore this path` (§7): structural, so it covers every record of an array. */
export function ignoreThisPathRule(node: DiffNode): string {
  return generalizeElementBrackets(node.path);
}

/**
 * `Ignore "updatedAt" everywhere` (§7). `**` compiles to `.*` in the core
 * matcher, so `**.updatedAt` matches the field at any depth, including the root.
 */
export function ignoreFieldEverywhereRule(node: DiffNode): string {
  return `**.${node.label}`;
}

/**
 * True when the node is an object property rather than an array element.
 * Array elements are labelled `[0]` / `[userId=102]` and have no field name to
 * ignore everywhere.
 */
export function isNamedField(node: DiffNode): boolean {
  return !node.label.startsWith('[') && node.label !== 'root';
}

/**
 * The grouped menu for a node. Copy visibility comes from `diffNodeActions` in
 * the clipboard module so the rules live in exactly one place.
 */
export function buildNodeMenu(node: DiffNode, target?: MatchingTarget): NodeMenuGroup[] {
  const copyable = diffNodeActions(node);
  const groups: NodeMenuGroup[] = [];

  const copy: NodeMenuItem[] = [];
  if (copyable.copyPath) copy.push({ id: 'copy-path', label: 'Copy path' });
  if (copyable.copyOldValue) copy.push({ id: 'copy-old-value', label: 'Copy old value' });
  if (copyable.copyNewValue) copy.push({ id: 'copy-new-value', label: 'Copy new value' });
  if (copyable.copySubtree) copy.push({ id: 'copy-subtree', label: 'Copy subtree' });
  if (copyable.copyChange) copy.push({ id: 'copy-change', label: 'Copy change' });
  if (copy.length) groups.push({ title: 'Copy', items: copy });

  const comparison: NodeMenuItem[] = [{ id: 'ignore-path', label: 'Ignore this path' }];
  if (isNamedField(node)) {
    comparison.push({ id: 'ignore-field-everywhere', label: `Ignore "${node.label}" everywhere` });
  }
  groups.push({ title: 'Comparison', items: comparison });

  if (target && !target.alreadyIncluded) {
    const item: NodeMenuItem = target.existingFields?.length
      ? { id: 'add-to-key', label: `Add "${target.fieldPath}" to matching key` }
      : { id: 'use-as-key', label: `Use "${target.fieldPath}" as matching key` };
    groups.push({ title: 'Array matching', items: [item] });
  }

  return groups;
}

/** The override an `use-as-key` / `add-to-key` action should write. */
export function matchingKeyOverride(target: MatchingTarget, action: 'use-as-key' | 'add-to-key'): ArrayMatchOverride {
  const fields =
    action === 'add-to-key' && target.existingFields?.length ? [...target.existingFields, target.fieldPath] : [target.fieldPath];
  return { strategy: 'key', fields };
}

/**
 * Writes (or clears) one array-matching override, preserving every other option.
 *
 * A `null` override deletes the entry, which is how "Reset to Auto" hands the
 * array back to inference. The map is dropped entirely once empty so a reset
 * comparison is byte-identical to one that never had an override.
 */
export function applyOverrideToOptions(options: DiffOptions, pattern: string, override: ArrayMatchOverride | null): DiffOptions {
  const map = { ...(options.arrayMatching ?? {}) };
  if (override) map[pattern] = override;
  else delete map[pattern];
  return { ...options, arrayMatching: Object.keys(map).length ? map : undefined };
}

/** What the matching controls emit. A `null` override means "reset to auto". */
export interface MatchingOverrideChange {
  pattern: string;
  override: ArrayMatchOverride | null;
}

/**
 * The `arrayMatching` map key for an array.
 *
 * Reuses an existing override's pattern so editing one never orphans it under a
 * second key; otherwise generalizes the array's own path so a decision applies
 * to every occurrence of that array rather than one parent element.
 */
export function overridePatternFor(analysis: ArrayMatchAnalysis): string {
  return analysis.override?.pattern ?? generalizeElementBrackets(analysis.path);
}
