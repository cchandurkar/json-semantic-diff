import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { DiffResult } from '../../core/diff';
import { DEFAULT_CONTEXT_LINES, emitSourceRows, segmentRows } from '../../source';
import { REORDER_TOOLTIP, buildItems, changeLabel, collapsedKeyContaining, leftMarker, matchSummary, rightMarker } from './source-view-model';

@Component({
  selector: 'app-source-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './source-diff.component.html',
  styleUrl: './source-diff.component.css'
})
export class SourceDiffComponent {
  readonly result = input.required<DiffResult>();
  readonly changesOnly = input(true);
  readonly selectedNodeId = input<string | null>(null);
  readonly nodeSelected = output<string>();

  /** Expanded collapsed-region keys, layered on top of the segments. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Rebuilt only when the diff result or the changes-only filter changes. */
  private readonly segments = computed(() => {
    const rows = emitSourceRows(this.result());
    return this.changesOnly() ? segmentRows(rows, DEFAULT_CONTEXT_LINES) : [{ kind: 'rows' as const, rows }];
  });

  readonly items = computed(() => buildItems(this.segments(), this.expanded()));

  // Template delegates: all presentation logic lives in the pure view model.
  readonly leftMarker = leftMarker;
  readonly rightMarker = rightMarker;
  readonly changeLabel = changeLabel;
  readonly matchSummary = matchSummary;
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

  expand(key: string): void {
    this.expanded.update(current => new Set(current).add(key));
  }
}

/** Escapes a canonical id for use inside a double-quoted attribute selector. */
function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
