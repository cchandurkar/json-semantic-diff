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
  /**
   * Collapsed rather than expanded paths: a fresh diff shows every row open, and
   * only paths the user explicitly closed are tracked.
   */
  readonly collapsed = signal(new Set<string>());
  readonly visibleNodes = computed(() => this.root().children ?? [this.root()]);

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
      this.collapsed.update(current => {
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
    next.has(path) ? next.delete(path) : next.add(path);
    this.collapsed.set(next);
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
