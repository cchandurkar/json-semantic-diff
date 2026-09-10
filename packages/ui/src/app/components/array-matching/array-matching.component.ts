import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import {
  ArrayMatchAnalysis,
  ArrayMatchOverride,
  CandidateStats,
  DiffNode,
  JsonObject,
  eligibleKeyPaths,
  evaluateKey
} from 'json-semantic-diff';
import { percent } from '../../shared/format';
import { MatchingOverrideChange, overridePatternFor } from '../../shared/node-actions';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { ArrayPickerComponent } from '../array-picker/array-picker.component';

/** One configurable array: its core analysis plus the node holding the rows. */
export interface ArrayMatchingContext {
  analysis: ArrayMatchAnalysis;
  node: DiffNode;
}

type Strategy = 'auto' | 'key' | 'position';

/**
 * Array-matching controls for the sidebar.
 *
 * Array matching is per-array while the sidebar is global, so the section opens
 * with an array picker. Draft state is local and committed only on Apply; the
 * analysis drawer stays a read-only explanation of whatever is in force.
 */
@Component({
  selector: 'app-array-matching',
  standalone: true,
  imports: [ArrayPickerComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './array-matching.component.html',
  styleUrl: './array-matching.component.css'
})
export class ArrayMatchingComponent {
  /** Whether a comparison exists at all. When false, renders a disabled full preview. */
  readonly hasResult = input(false);
  /** Every array in the current comparison, in document order. */
  readonly arrays = input<readonly ArrayMatchingContext[]>([]);
  /** An externally-driven selection, e.g. from a Tree match-pill click. */
  readonly selectedPath = input<string | null>(null);

  readonly overrideChanged = output<MatchingOverrideChange>();
  /** Fired only when the USER picks a different array via this component's own select. */
  readonly arraySelected = output<string>();

  /** Which array the controls are editing; defaults to the first. */
  private readonly chosenPath = signal<string | null>(null);
  /** Draft state, committed only on Apply. */
  readonly strategy = signal<Strategy>('auto');
  readonly selectedFields = signal<readonly string[]>([]);

  readonly selected = computed<ArrayMatchingContext | null>(() => {
    const list = this.arrays();
    if (!list.length) return null;
    const path = this.chosenPath();
    return list.find((context) => context.analysis.path === path) ?? list[0];
  });

  /** Plain analyses for `ArrayPickerComponent`, which doesn't need the draft-editing `node`. */
  readonly arrayAnalyses = computed(() => this.arrays().map((context) => context.analysis));

  constructor() {
    // An externally-driven selection (Tree match-pill, analysis panel default)
    // takes over the local choice. Guarded to only fire on an actual change, so
    // this never re-triggers itself and never fights the user's own picks.
    effect(() => {
      const incoming = this.selectedPath();
      if (incoming !== null && incoming !== this.chosenPath()) this.chosenPath.set(incoming);
    });

    // Re-seed the draft whenever a different array is chosen, or a recompute
    // replaces the analysis object after Apply.
    effect(() => this.seedDraft());
  }

  /** Scalar leaf paths available as key fields; empty for non-object arrays. */
  readonly eligibleFields = computed<string[]>(() => {
    const rows = this.objectRows();
    return rows ? eligibleKeyPaths(rows.left, rows.right) : [];
  });

  /** Live stats for the draft key, straight from core scoring - never recomputed here. */
  readonly draftStats = computed<CandidateStats | undefined>(() => {
    const rows = this.objectRows();
    const fields = this.selectedFields();
    if (!rows || !fields.length) return undefined;
    return evaluateKey(rows.left, rows.right, [...fields]);
  });

  /** Per-field score from the existing inference, for the score annotations. */
  readonly fieldScores = computed<Record<string, number>>(() => {
    const inference = this.selected()?.analysis.inference;
    const scores: Record<string, number> = {};
    for (const candidate of [inference?.best, ...(inference?.alternatives ?? [])]) {
      if (candidate?.paths.length === 1) scores[candidate.paths[0]] ??= candidate.score;
    }
    return scores;
  });

  readonly recommendedField = computed<string | undefined>(() => {
    const best = this.selected()?.analysis.inference?.best;
    return best?.paths.length === 1 ? best.paths[0] : undefined;
  });

  readonly canApply = computed(() => this.strategy() !== 'key' || this.selectedFields().length > 0);
  readonly hasOverride = computed(() => !!this.selected()?.analysis.override);

  chooseArray(path: string): void {
    this.chosenPath.set(path);
    this.arraySelected.emit(path);
  }

  isSelected(field: string): boolean {
    return this.selectedFields().includes(field);
  }

  toggleField(field: string): void {
    this.selectedFields.update((fields) => (fields.includes(field) ? fields.filter((f) => f !== field) : [...fields, field]));
  }

  apply(): void {
    const analysis = this.selected()?.analysis;
    if (!analysis || !this.canApply()) return;
    const strategy = this.strategy();
    const override: ArrayMatchOverride = strategy === 'key' ? { strategy: 'key', fields: [...this.selectedFields()] } : { strategy };
    this.overrideChanged.emit({ pattern: overridePatternFor(analysis), override });
  }

  resetToAuto(): void {
    const analysis = this.selected()?.analysis;
    if (analysis) this.overrideChanged.emit({ pattern: overridePatternFor(analysis), override: null });
  }

  /**
   * Discards uncommitted edits. In the old dropdown this closed the panel; the
   * sidebar is permanent, so it reverts the draft to what is actually applied.
   */
  cancel(): void {
    this.seedDraft();
  }

  /** Kept out of the template: a `<` in a template expression confuses the parser. */
  isNotUnique(stats: CandidateStats): boolean {
    return stats.uniquenessA !== 1 || stats.uniquenessB !== 1;
  }

  meanUniqueness(stats: CandidateStats): number {
    return (stats.uniquenessA + stats.uniquenessB) / 2;
  }

  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;

  private seedDraft(): void {
    const override = this.selected()?.analysis.override;
    this.strategy.set(override?.strategy ?? 'auto');
    this.selectedFields.set(override?.strategy === 'key' ? [...(override.fields ?? [])] : []);
  }

  /** Both sides as object rows, or `null` when this is not an array of objects. */
  private objectRows(): { left: JsonObject[]; right: JsonObject[] } | null {
    const node = this.selected()?.node;
    const left = node?.left;
    const right = node?.right;
    if (!Array.isArray(left) || !Array.isArray(right)) return null;
    if (!left.every(isPlainObject) || !right.every(isPlainObject)) return null;
    return { left: left as JsonObject[], right: right as JsonObject[] };
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
