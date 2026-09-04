import { DiffNode, JsonValue } from '../../core/diff';

/**
 * Framework-free clipboard formatting for diff nodes.
 *
 * Deliberately contains no Angular, no RxJS, no DOM and no `navigator.clipboard`
 * call: a later lane wires `@angular/cdk/clipboard` to these functions. Every
 * export here is a pure, deterministic function so it is testable
 * without a browser (more-features.md §10).
 */

/** Which side of the comparison a value is read from. */
export type DiffSide = 'left' | 'right';

/** The arrow used between old and new values. U+2192. */
const ARROW = '\u2192';

/**
 * The DiffLens *semantic* path: identity-matched array elements spell out the
 * key that matched them, e.g. `$.products[sku=ABC123].price`.
 *
 * NAMING (more-features.md §3): this is intentionally NOT called `formatJsonPath`.
 * The `[sku=ABC123]` selector is a DiffLens convention, not standards-compliant
 * JSONPath, and the spec asks that the distinction be explicit in naming rather
 * than implied. Use `formatPhysicalPath` when a positional path is wanted.
 */
export function formatSemanticPath(node: DiffNode): string {
  return node.id;
}

/**
 * The physical path, which renders identity-matched elements value-only
 * (`$.users[102]`). Kept as the counterpart to `formatSemanticPath` so callers
 * choose consciously; `id === path` for every non-identity node.
 */
export function formatPhysicalPath(node: DiffNode): string {
  return node.path;
}

/**
 * Renders a JSON value exactly as JSON, with no UI decoration.
 *
 * Scalars come out as `"active"`, `12.99`, `true`, `null`; objects and arrays
 * pretty-print with 2-space indent. `undefined` (an absent side) yields an
 * empty string rather than the literal `"undefined"`.
 */
export function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

/**
 * Reads one side of a node, preferring the PRE-normalization value.
 *
 * The model stores normalized `left`/`right` (timestamps rewritten to ISO,
 * numeric strings coerced to numbers) and the untouched input in
 * `leftRaw`/`rightRaw`. A user pasting into Slack or Jira expects what they
 * actually typed, so raw wins wherever it exists. This matches how the Source
 * view's ORIGINAL / CHANGED panes read values.
 *
 * CAVEAT: `leftRaw`/`rightRaw` are populated on value-bearing leaves only.
 * A *paired* object/array node (one the engine walked into and gave children)
 * carries no raw value, so copying its subtree yields the normalized form.
 * Added and removed subtrees are leaves and do carry raw, so those are exact.
 */
export function readSide(node: DiffNode, side: DiffSide): JsonValue | undefined {
  return side === 'left' ? node.leftRaw ?? node.left : node.rightRaw ?? node.right;
}

/** The old (ORIGINAL) value. Empty string on an added node, which has no old side. */
export function formatOldValue(node: DiffNode): string {
  return formatValue(readSide(node, 'left'));
}

/** The new (CHANGED) value. Empty string on a removed node, which has no new side. */
export function formatNewValue(node: DiffNode): string {
  return formatValue(readSide(node, 'right'));
}

/**
 * Pretty-printed valid JSON for one side of an object/array node
 * (more-features.md §5). Scalars are not rejected - they simply render as their
 * JSON literal - but `diffNodeActions` marks subtree copying unavailable for
 * them so the menu can omit it.
 */
export function formatSubtree(node: DiffNode, side: DiffSide): string {
  return formatValue(readSide(node, side));
}

/**
 * Concise, paste-friendly plain text describing a single change
 * (more-features.md §6). No HTML, no UI decoration.
 *
 *   modified      `$.products[sku=ABC123].price\n12.99 ${ARROW} 14.99`
 *   added         `$.customer.loyaltyTier\n+ "gold"`
 *   removed       `$.customer.legacyCode\n- "ABC"`
 *
 * `type-changed` renders exactly like `modified`: JSON quoting already discloses
 * the type shift (`12 ${ARROW} "12"`), so an extra annotation would add noise
 * without adding information.
 *
 * Multi-line values (objects and arrays) switch to a line-prefixed block so the
 * old and new sides stay unambiguous when pasted:
 *
 *   `$.customer\n- {\n-   "a": 1\n- }\n+ {\n+   "a": 2\n+ }`
 */
export function formatChange(node: DiffNode): string {
  const path = formatSemanticPath(node);
  const oldValue = formatOldValue(node);
  const newValue = formatNewValue(node);

  switch (node.changeKind) {
    case 'added':
      return `${path}\n${prefixLines(newValue, '+ ')}`;
    case 'removed':
      return `${path}\n${prefixLines(oldValue, '- ')}`;
    case 'modified':
    case 'type-changed':
      return isSingleLine(oldValue) && isSingleLine(newValue)
        ? `${path}\n${oldValue} ${ARROW} ${newValue}`
        : `${path}\n${prefixLines(oldValue, '- ')}\n${prefixLines(newValue, '+ ')}`;
    // Unchanged nodes have no change to describe. `diffNodeActions` reports
    // `copyChange: false` for them, so this is a degenerate fallback.
    default:
      return path;
  }
}

/** The clipboard actions a context menu may offer for a node. */
export type DiffNodeAction = 'copyPath' | 'copyOldValue' | 'copyNewValue' | 'copySubtree' | 'copyChange';

/**
 * Which actions make sense for a node (more-features.md §2), as data rather than
 * UI. The menu lane consumes this instead of re-deriving the rules:
 *
 *   added node    -> no "copy old value" (there is no old side)
 *   removed node  -> no "copy new value"
 *   scalar node   -> no "copy subtree"
 *   unchanged     -> no "copy change"
 */
export function diffNodeActions(node: DiffNode): Record<DiffNodeAction, boolean> {
  return {
    copyPath: true,
    copyOldValue: node.changeKind !== 'added',
    copyNewValue: node.changeKind !== 'removed',
    copySubtree: node.nodeKind !== 'scalar',
    copyChange: node.changeKind !== 'unchanged'
  };
}

/** The same rules as an ordered list, for menus that just iterate. */
export function availableDiffNodeActions(node: DiffNode): DiffNodeAction[] {
  const actions = diffNodeActions(node);
  return (Object.keys(actions) as DiffNodeAction[]).filter(action => actions[action]);
}

function isSingleLine(text: string): boolean {
  return !text.includes('\n');
}

function prefixLines(text: string, prefix: string): string {
  return text.split('\n').map(line => `${prefix}${line}`).join('\n');
}
