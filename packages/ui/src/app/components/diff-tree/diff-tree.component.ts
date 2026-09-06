import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DiffNode, JsonValue } from 'json-semantic-diff';
import { percent } from '../../shared/format';
import { ancestorPaths } from '../../shared/node-navigation';
import { NodeActionEvent, NodeActionId, buildNodeMenu, deriveMatchingTarget } from '../../shared/node-actions';
import { DiffSegment, diffText } from '../../shared/text-diff';

/** Arrays/objects should never be char-diffed against their "Array(N)"/"{N keys}" summary strings. */
function isContainer(value: JsonValue | undefined): boolean {
  return value !== null && value !== undefined && typeof value === 'object';
}

/** Nodes in template render order, respecting the same `changesOnly`/collapse gating as the row template. */
function flattenVisible(node: DiffNode, collapsed: ReadonlySet<string>, changesOnly: boolean): DiffNode[] {
  if (changesOnly && !node.hasChanges) return [];
  const out: DiffNode[] = [node];
  if (node.children?.length && !collapsed.has(node.path)) {
    for (const child of node.children) out.push(...flattenVisible(child, collapsed, changesOnly));
  }
  return out;
}

/** Splits `text` around the first case-insensitive occurrence of `query`, or null when there's no match. */
export function splitMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  const q = query.trim();
  if (!q || !text) return null;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return null;
  return { before: text.slice(0, index), match: text.slice(index, index + q.length), after: text.slice(index + q.length) };
}

@Component({
  selector: 'app-diff-tree',
  standalone: true,
  imports: [NgTemplateOutlet, CdkMenu, CdkMenuItem, CdkMenuGroup, CdkMenuTrigger, CdkContextMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diff-tree.component.html',
  styleUrl: './diff-tree.component.css'
})
export class DiffTreeComponent {
  readonly root = input.required<DiffNode>();
  readonly changesOnly = input(true);
  readonly selectedNodeId = input<string | null>(null);
  /** Every id in the selected node's subtree, so a container highlights as one block. */
  readonly selectedRange = input<ReadonlySet<string>>(new Set());
  /** Canonical ids of every current search match, independent of selection. */
  readonly searchResultIds = input<ReadonlySet<string>>(new Set());
  readonly searchQuery = input('');
  readonly analysisRequested = output<string>();
  readonly nodeSelected = output<string>();
  readonly nodeAction = output<NodeActionEvent>();
  /**
   * Collapsed rather than expanded paths: a fresh diff shows every row open, and
   * only paths the user explicitly closed are tracked.
   */
  readonly collapsed = signal(new Set<string>());
  readonly visibleNodes = computed(() => [this.root()]);

  /**
   * Every node currently rendered, in the exact order the template walks
   * them - mirroring its `changesOnly`/expansion gating - so the selected
   * range's start/end can be found without duplicating that logic in CSS.
   */
  private readonly visibleFlat = computed(() => flattenVisible(this.root(), this.collapsed(), this.changesOnly()));

  /**
   * First and last VISIBLE node id belonging to the selected range, so the
   * highlight can draw one continuous border around the whole group instead
   * of tinting every row's own background.
   */
  readonly rangeEndpoints = computed(() => {
    const range = this.selectedRange();
    let start: string | null = null;
    let end: string | null = null;
    for (const node of this.visibleFlat()) {
      if (range.has(node.id)) {
        if (start === null) start = node.id;
        end = node.id;
      }
    }
    return { start, end };
  });

  constructor() {
    // A new comparison starts fully expanded again.
    effect(() => {
      this.root();
      this.collapsed.set(new Set());
    });

    // A selection arriving from elsewhere (Source view, prev/next) must be visible.
    // The collapsed set is keyed on `path`, so ancestors are collected by walking
    // the tree - path strings cannot be sliced safely because identity brackets
    // may themselves contain '.' or '['.
    effect(() => {
      const id = this.selectedNodeId();
      if (!id) return;
      const ancestors = ancestorPaths(this.root(), id);
      if (!ancestors.length) return;
      this.collapsed.update((current) => {
        const next = new Set(current);
        for (const path of ancestors) next.delete(path);
        return next;
      });
    });
  }

  isExpanded(path: string): boolean {
    return !this.collapsed().has(path);
  }

  toggle(path: string): void {
    const next = new Set(this.collapsed());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.collapsed.set(next);
  }

  marker(changeKind: DiffNode['changeKind']): string {
    return changeKind === 'added'
      ? '+'
      : changeKind === 'removed'
        ? '−'
        : changeKind === 'modified' || changeKind === 'type-changed'
          ? '~'
          : '';
  }

  display(value: JsonValue | undefined): string {
    if (value === undefined) return '';
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value && typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
  }

  /**
   * Word-level segments for one side of a modified/type-changed scalar row,
   * so the row-level highlight can be layered with GitHub-style intra-line
   * marks. Falls back to one unchanged segment (today's plain rendering) for
   * every other row, and for container values whose "Array(N)"/"{N keys}"
   * summaries would produce meaningless char-diffing.
   */
  valueSegments(node: DiffNode, side: 'left' | 'right'): DiffSegment[] {
    const raw = side === 'left' ? node.left : node.right;
    if (!this.canHighlight(node)) return [{ text: this.display(raw), changed: false }];
    const { left, right } = diffText(this.display(node.left), this.display(node.right));
    return side === 'left' ? left : right;
  }

  private canHighlight(node: DiffNode): boolean {
    if (node.changeKind !== 'modified' && node.changeKind !== 'type-changed') return false;
    return !isContainer(node.left) && !isContainer(node.right);
  }

  /**
   * Menu contents for one node. Evaluated only for the menu actually being
   * rendered - CDK instantiates the template lazily on open - so this stays O(1)
   * per interaction rather than per row.
   */
  menuGroups(node: DiffNode) {
    return buildNodeMenu(node, deriveMatchingTarget(this.root(), node.id));
  }

  emitAction(action: NodeActionId, node: DiffNode): void {
    this.nodeAction.emit({ action, node, target: deriveMatchingTarget(this.root(), node.id) });
  }

  /** True for the pill that opens the matching panel: auto identity or a pinned key. */
  showsKeyPill(node: DiffNode): boolean {
    const outcome = node.arrayMatch?.outcome;
    return outcome === 'identity-applied' || outcome === 'manual-key';
  }

  /** `Matched by store + sku · Manual` for an override, `· 97%` for inference. */
  keyPillSuffix(node: DiffNode): string {
    const match = node.arrayMatch;
    if (!match) return '';
    return match.override ? 'Manual' : percent(match.inference?.best?.score);
  }

  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;
  /** Re-exported for the template. */
  readonly splitMatch = splitMatch;
}
