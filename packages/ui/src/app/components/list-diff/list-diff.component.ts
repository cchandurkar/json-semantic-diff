import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { DiffNode } from 'json-semantic-diff';
import { NodeActionEvent, NodeActionId, NodeMenuGroup, buildNodeMenu } from '../../shared/node-actions';
import { ListDiffRow, buildListRows, rowMatchesQuery, splitMatch } from './list-view-model';

function cssAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

@Component({
  selector: 'app-list-diff',
  standalone: true,
  imports: [CdkMenu, CdkMenuItem, CdkMenuGroup, CdkMenuTrigger, CdkContextMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-diff.component.html',
  styleUrl: './list-diff.component.css'
})
export class ListDiffComponent {
  readonly root = input<DiffNode | null>(null);
  readonly changesOnly = input(true);
  readonly selectedNodeId = input<string | null>(null);
  readonly searchResultIds = input<ReadonlySet<string>>(new Set());
  readonly searchQuery = input('');

  readonly nodeSelected = output<string>();
  readonly nodeAction = output<NodeActionEvent>();
  readonly analysisRequested = output<string>();

  readonly rows = computed(() => buildListRows(this.root(), this.changesOnly()));

  readonly splitMatch = splitMatch;
  readonly rowMatchesQuery = rowMatchesQuery;

  constructor() {
    effect(() => {
      const id = this.selectedNodeId();
      if (!id) return;
      if (typeof document === 'undefined') return;
      setTimeout(() => {
        document.querySelector(`[data-node-id="${cssAttr(id)}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    });
  }

  changeLabel(row: ListDiffRow): string {
    switch (row.changeKind) {
      case 'added':
        return 'Added';
      case 'removed':
        return 'Removed';
      case 'modified':
        return 'Modified';
      case 'type-changed':
        return 'Type changed';
      default:
        return 'Unchanged';
    }
  }

  rowMenu(node: DiffNode): NodeMenuGroup[] {
    return buildNodeMenu(node).filter((group) => group.title === 'Copy' || group.title === 'Comparison');
  }

  emitAction(action: NodeActionId, node: DiffNode): void {
    this.nodeAction.emit({ action, node });
  }

  selectRow(nodeId: string, _event?: Event): void {
    if (typeof window !== 'undefined' && window.getSelection()?.toString().trim()) {
      return;
    }
    this.nodeSelected.emit(nodeId);
  }

  onRowKeydown(nodeId: string, event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectRow(nodeId, event);
    }
  }
}
