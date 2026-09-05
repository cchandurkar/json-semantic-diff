import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { ArrayMatchAnalysis, CandidateStats, DiffResult } from '../../core/diff';
import { percent } from '../../shared/format';
import { ArrayPickerComponent } from '../array-picker/array-picker.component';

/**
 * Right rail: summary counts and the matching-analysis explanation that used
 * to live in an overlay drawer. Change navigation (prev/next) lives in the
 * middle column's toolbar, next to the Tree/Source tabs.
 *
 * Display only, same spirit as the retired `AnalysisDrawerComponent` - it
 * reports what the core decided and why. The controls that CHANGE a matching
 * decision live in the sidebar's Array matching section; this panel never
 * mutates comparison options, it just always shows the currently selected one.
 *
 * Above the drawer breakpoint it is a flex column with its own scroll. Below
 * it, the panel becomes an off-canvas drawer behind a toggle button - the same
 * signal-driven pattern used by `SidebarComponent`.
 */
@Component({
  selector: 'app-analysis-panel',
  standalone: true,
  imports: [ArrayPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-panel.component.html',
  styleUrl: './analysis-panel.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape($event)'
  }
})
export class AnalysisPanelComponent {
  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  readonly result = input<DiffResult | null>(null);
  /** The array currently explained; the parent defaults this to `primaryAnalysis`. */
  readonly analysis = input<ArrayMatchAnalysis | null>(null);
  /** An externally-driven selection, e.g. from a Tree match-pill click or the sidebar's own picker. */
  readonly selectedPath = input<string | null>(null);

  /** Fired only when the USER picks a different array via this panel's own select. */
  readonly arraySelected = output<string>();

  /** Drawer state; only meaningful below the breakpoint, where the toggle shows. */
  readonly open = signal(false);

  /** Set optimistically on the user's own pick; reconciled from `selectedPath` otherwise. */
  private readonly chosenPath = signal<string | null>(null);

  readonly hasAnalysis = computed(() => (this.result()?.arrays.length ?? 0) > 0);
  /** The picker's bound selection: the user's own pick wins over the parent-supplied default. */
  readonly dropdownPath = computed(() => this.chosenPath() ?? this.analysis()?.path ?? null);

  constructor() {
    // An externally-driven selection (Tree match-pill, sidebar's own picker) takes
    // over the local choice. Guarded to only fire on an actual change, so this
    // never re-triggers itself and never fights the user's own picks - the same
    // pattern used by ArrayMatchingComponent's chosenPath/selectedPath effect.
    effect(() => {
      const incoming = this.selectedPath();
      if (incoming !== null && incoming !== this.chosenPath()) this.chosenPath.set(incoming);
    });
  }

  chooseArray(path: string): void {
    this.chosenPath.set(path);
    this.arraySelected.emit(path);
  }

  toggle(): void {
    this.open.update(value => !value);
  }

  /**
   * Escape closes the drawer, unless it was pressed inside a CDK overlay - a
   * dropdown, menu or tooltip owns its own Escape and should not also collapse
   * the panel behind it.
   */
  onEscape(event: Event): void {
    const target = event.target as Element | null;
    if (target?.closest?.('.cdk-overlay-container')) return;
    this.close(true);
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.toggleButton().nativeElement.focus();
  }

  /** Heading for the selected-key section, branching on provenance not mechanism. */
  selectionLabel(): string {
    switch (this.analysis()?.outcome) {
      case 'manual-key': return 'MANUAL OVERRIDE';
      case 'manual-position': return 'MANUAL · POSITION';
      case 'identity-applied': return 'SELECTED';
      default: return 'TOP CANDIDATE';
    }
  }

  /** Mean uniqueness across both sides, the figure the duplicate-key notice shows. */
  meanUniqueness(stats: CandidateStats): number {
    return (stats.uniquenessA + stats.uniquenessB) / 2;
  }

  metrics(best: CandidateStats): { label: string; value: number }[] {
    return [
      { label: 'Uniqueness · original', value: best.uniquenessA },
      { label: 'Uniqueness · changed', value: best.uniquenessB },
      { label: 'Completeness', value: best.completeness },
      { label: 'Cross-input match coverage', value: best.matchCoverage },
      { label: 'Value overlap', value: best.overlap },
      { label: 'Type consistency', value: best.typeConsistency },
      { label: 'Field-name hint', value: best.nameHint }
    ];
  }

  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;
}
