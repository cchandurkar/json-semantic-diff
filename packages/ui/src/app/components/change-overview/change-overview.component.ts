import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DiffNode } from 'json-semantic-diff';
import { ChangeAreaNode, buildChangeOverview } from '../../shared/change-overview';

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

  /** Collapsed-by-default outline: a compact table of contents, expanded on demand. */
  readonly collapsed = signal(new Set<string>());

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
