import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DiffNode } from 'json-semantic-diff';
import { ChangeAreaNode, buildChangeOverview, defaultCollapsedAreaIds } from '../../shared/change-overview';

/**
 * Compact navigable outline of where changes are concentrated in the diff,
 * grouped hierarchically by canonical path. Purely a renderer over
 * `buildChangeOverview` - all grouping/counting semantics live there, this
 * component only draws rows and forwards clicks.
 *
 * Deliberately neutral: no added/removed/modified color coding (spec item 3).
 * Every row gets a bar, sized relative to the largest count anywhere in the
 * outline (`maxCount`), mirroring the analysis panel's existing `.track`/`.fill`
 * metric-bar pattern.
 */
@Component({
  selector: 'app-change-overview',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-overview.component.html',
  styleUrl: './change-overview.component.css'
})
export class ChangeOverviewComponent {
  readonly root = input<DiffNode | null>(null);
  readonly selectedNodeId = input<string | null>(null);
  readonly nodeSelected = output<string>();

  readonly areas = computed(() => {
    const r = this.root();
    return r ? buildChangeOverview(r) : [];
  });
  readonly maxCount = computed(() => Math.max(1, ...this.areas().map((a) => a.count)));

  /**
   * Areas deeper than the root start collapsed (see `defaultCollapsedAreaIds`);
   * only root areas start open. Resets to that default whenever the diff
   * changes, so a fresh comparison always opens readable.
   */
  readonly collapsed = signal(new Set<string>());

  constructor() {
    effect(() => this.collapsed.set(defaultCollapsedAreaIds(this.areas())));
  }

  isExpanded(nodeId: string): boolean {
    return !this.collapsed().has(nodeId);
  }

  toggle(nodeId: string): void {
    const next = new Set(this.collapsed());
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    this.collapsed.set(next);
  }

  barWidth(area: ChangeAreaNode): number {
    return (area.count / this.maxCount()) * 100;
  }
}
