import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DiffNode, JsonValue } from '../../core/models/diff.models';
import { percent } from '../../shared/format';
import { ancestorPaths } from '../../shared/node-navigation';

@Component({
  selector: 'app-diff-tree',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diff-tree.component.html',
  styleUrl: './diff-tree.component.css'
})
export class DiffTreeComponent {
  readonly root = input.required<DiffNode>();
  readonly changesOnly = input(true);
  readonly selectedNodeId = input<string | null>(null);
  readonly analysisRequested = output<string>();
  readonly nodeSelected = output<string>();
  readonly expanded = signal(new Set<string>(['$']));
  readonly visibleNodes = computed(() => this.root().children ?? [this.root()]);

  constructor() {
    // A selection arriving from elsewhere (Source view, prev/next) must be visible.
    // The expansion set is keyed on `path`, so ancestors are collected by walking
    // the tree - path strings cannot be sliced safely because identity brackets
    // may themselves contain '.' or '['.
    effect(() => {
      const id = this.selectedNodeId();
      if (!id) return;
      const ancestors = ancestorPaths(this.root(), id);
      if (ancestors.length) this.expanded.update(current => new Set([...current, ...ancestors]));
    });
  }

  toggle(path: string): void {
    const next = new Set(this.expanded());
    next.has(path) ? next.delete(path) : next.add(path);
    this.expanded.set(next);
  }

  marker(changeKind: DiffNode['changeKind']): string {
    return changeKind === 'added' ? '+' : changeKind === 'removed' ? '−' : changeKind === 'modified' || changeKind === 'type-changed' ? '~' : '';
  }

  display(value: JsonValue | undefined): string {
    if (value === undefined) return '';
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value && typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
  }

  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;
}
