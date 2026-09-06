import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DiffNode, DiffResult } from '../../core/diff';
import { findNodeById } from '../../shared/node-navigation';
import { NodeActionEvent, NodeActionId, NodeMenuGroup, buildNodeMenu } from '../../shared/node-actions';
import { DEFAULT_CONTEXT_LINES, emitSourceRows, segmentRows } from '../../source';
import { REORDER_TOOLTIP, buildItems, changeLabel, collapsedKeyContaining, leftMarker, matchSummary, renderCell, rightMarker } from './source-view-model';

@Component({
  selector: 'app-source-diff',
  standalone: true,
  imports: [CdkMenu, CdkMenuItem, CdkMenuGroup, CdkMenuTrigger, CdkContextMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './source-diff.component.html',
  styleUrl: './source-diff.component.css'
})
export class SourceDiffComponent {
  readonly result = input.required<DiffResult>();
  readonly changesOnly = input(true);
  readonly selectedNodeId = input<string | null>(null);
  /** Every id in the selected node's subtree, so a container highlights as one block. */
  readonly selectedRange = input<ReadonlySet<string>>(new Set());
  /** The canonical tree, so a row id can be resolved back to its node. */
  readonly root = input<DiffNode | null>(null);
  readonly nodeSelected = output<string>();
  readonly nodeAction = output<NodeActionEvent>();

  /** Expanded collapsed-region keys, layered on top of the segments. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Rebuilt only when the diff result or the changes-only filter changes. */
  private readonly segments = computed(() => {
    const rows = emitSourceRows(this.result());
    return this.changesOnly() ? segmentRows(rows, DEFAULT_CONTEXT_LINES) : [{ kind: 'rows' as const, rows }];
  });

  readonly items = computed(() => buildItems(this.segments(), this.expanded()));

  /**
   * Index of the first and last VISIBLE row belonging to the selected range,
   * so the Tree/Source highlight can draw one continuous border around the
   * whole group instead of tinting every row's own background. Tracked by
   * array index rather than nodeId: a container's opening and closing scaffold
   * rows share one nodeId, and only the closing row is the true end.
   */
  readonly rangeEndpoints = computed(() => {
    const range = this.selectedRange();
    const items = this.items();
    let start = -1;
    let end = -1;
    items.forEach((item, index) => {
      if (item.kind === 'row' && range.has(item.row.nodeId)) {
        if (start === -1) start = index;
        end = index;
      }
    });
    return { start, end };
  });

  // Template delegates: all presentation logic lives in the pure view model.
  readonly leftMarker = leftMarker;
  readonly rightMarker = rightMarker;
  readonly changeLabel = changeLabel;
  readonly matchSummary = matchSummary;
  readonly renderCell = renderCell;
  readonly reorderTooltip = REORDER_TOOLTIP;

  constructor() {
    // Scrolling to the selected node is the one place this view touches the DOM.
    effect(() => {
      const id = this.selectedNodeId();
      if (!id) return;
      const key = collapsedKeyContaining(this.segments(), id, this.expanded());
      if (key) this.expand(key);
      // Expanding queues a re-render; scroll once the DOM has caught up.
      setTimeout(() => document.querySelector(`[data-node-id="${cssAttr(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
  }

  /**
   * Copy-only menu for a source row (§9).
   *
   * Source rows map to canonical node ids, so the same `buildNodeMenu` model is
   * reused and then filtered to the copy group: ignore and matching actions need
   * tree context (the containing array) that a flat row does not carry.
   */
  rowMenu(nodeId: string): NodeMenuGroup[] {
    const node = this.nodeFor(nodeId);
    if (!node) return [];
    return buildNodeMenu(node).filter(group => group.title === 'Copy');
  }

  emitAction(action: NodeActionId, nodeId: string): void {
    const node = this.nodeFor(nodeId);
    if (node) this.nodeAction.emit({ action, node });
  }

  private nodeFor(nodeId: string): DiffNode | undefined {
    const root = this.root();
    return root ? findNodeById(root, nodeId) : undefined;
  }

  expand(key: string): void {
    this.expanded.update(current => new Set(current).add(key));
  }
}

/** Escapes a canonical id for use inside a double-quoted attribute selector. */
function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
