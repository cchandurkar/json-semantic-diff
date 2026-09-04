import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, TemplateRef, ViewContainerRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ArrayMatchAnalysis, ArrayMatchOverride, CandidateStats, DiffNode, JsonObject, eligibleKeyPaths, evaluateKey } from '../../core/diff';
import { percent } from '../../shared/format';
import { MatchingOverrideChange, overridePatternFor } from '../../shared/node-actions';

/** One configurable array: its core analysis plus the node holding the rows. */
export interface ArrayMatchingContext {
  analysis: ArrayMatchAnalysis;
  node: DiffNode;
}

type Strategy = 'auto' | 'key' | 'position';

/**
 * Preference order: open ABOVE the trigger, falling back to below only when
 * there is not enough room above.
 *
 * The toolbar is `position:sticky`, so once the user scrolls into the results it
 * sits near the top of the viewport and there genuinely may be no room above -
 * hence the below-* fallbacks rather than a hard flip.
 */
const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 }
];

/**
 * Comparison settings dropdown for the diff toolbar.
 *
 * Uses the ARIA disclosure pattern rather than a menu: the panel holds native
 * form controls, not menu commands, so plain Tab navigation and native
 * checkbox/radio semantics are both simpler and more accurate than
 * `role="menu"` would be.
 *
 * Also hosts the per-array matching controls. Array matching is per-array while
 * this panel is global, so the section begins with an array picker; the analysis
 * drawer stays a read-only explanation of whatever is in force.
 */
@Component({
  selector: 'app-settings-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-menu.component.html',
  styleUrl: './settings-menu.component.css',
  host: {
    '(document:keydown.escape)': 'close(true)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class SettingsMenuComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);

  private readonly viewContainer = inject(ViewContainerRef);
  private readonly panelTemplate = viewChild.required<TemplateRef<unknown>>('panelTpl');
  private overlayRef?: OverlayRef;
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** Pure view filter owned by the app: toggling it must never recompare. */
  readonly changesOnly = input(true);
  readonly normalizeTimestamps = input(false);
  readonly normalizeNumbers = input(false);
  /** Every array in the current comparison, in document order. */
  readonly arrays = input<readonly ArrayMatchingContext[]>([]);

  readonly changesOnlyChange = output<boolean>();
  readonly normalizeTimestampsChange = output<boolean>();
  readonly normalizeNumbersChange = output<boolean>();
  readonly overrideChanged = output<MatchingOverrideChange>();

  readonly open = signal(false);

  /** Which array the matching controls are editing; defaults to the first. */
  private readonly chosenPath = signal<string | null>(null);
  /** Draft state, committed only on Apply. */
  readonly strategy = signal<Strategy>('auto');
  readonly selectedFields = signal<readonly string[]>([]);

  readonly selected = computed<ArrayMatchingContext | null>(() => {
    const list = this.arrays();
    if (!list.length) return null;
    const path = this.chosenPath();
    return list.find(context => context.analysis.path === path) ?? list[0];
  });

  constructor() {
    // Attach/detach the overlay, then move focus into the panel so the keyboard
    // path is immediate. Attachment completes synchronously here, but the focus
    // target only exists after the embedded view renders.
    effect(() => {
      if (this.open()) this.attachPanel();
      else this.overlayRef?.detach();
    });

    effect(() => {
      if (!this.open()) return;
      const pane = this.overlayRef?.overlayElement;
      if (pane) setTimeout(() => pane.querySelector('input')?.focus());
    });

    // Re-seed the draft whenever a different array is chosen, or a recompute
    // replaces the analysis object after Apply.
    effect(() => {
      const override = this.selected()?.analysis.override;
      this.strategy.set(override?.strategy ?? 'auto');
      this.selectedFields.set(override?.strategy === 'key' ? [...(override.fields ?? [])] : []);
    });
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

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  /**
   * Renders the panel into the body-level overlay container.
   *
   * Uses the imperative Overlay API rather than `CdkConnectedOverlay` because the
   * tooltip already pulls that code in, so this costs no extra bundle weight. The
   * portal keeps this component's `ViewContainerRef`, so the panel stays part of
   * this view and its encapsulated component styles still apply.
   */
  private attachPanel(): void {
    this.overlayRef ??= this.overlay.create({
      panelClass: 'settings-overlay-panel',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.trigger())
        .withPositions(PANEL_POSITIONS)
        .withPush(true)
        .withViewportMargin(8)
        .withFlexibleDimensions(false)
    });
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new TemplatePortal(this.panelTemplate(), this.viewContainer));
    }
  }

  toggle(): void {
    this.open.update(value => !value);
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  onDocumentPointerDown(event: Event): void {
    if (!this.open()) return;
    const target = event.target as Node;
    // The trigger is handled by its own click, which toggles.
    if (this.host.nativeElement.contains(target)) return;
    // The panel is rendered into the CDK overlay container, outside this host.
    if (this.overlayRef?.overlayElement.contains(target)) return;
    this.close();
  }

  /** Reads the new state off a checkbox change event. */
  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  chooseArray(event: Event): void {
    this.chosenPath.set((event.target as HTMLSelectElement).value);
  }

  isSelected(field: string): boolean {
    return this.selectedFields().includes(field);
  }

  toggleField(field: string): void {
    this.selectedFields.update(fields =>
      fields.includes(field) ? fields.filter(f => f !== field) : [...fields, field]
    );
  }

  apply(): void {
    const analysis = this.selected()?.analysis;
    if (!analysis || !this.canApply()) return;
    const strategy = this.strategy();
    const override: ArrayMatchOverride =
      strategy === 'key' ? { strategy: 'key', fields: [...this.selectedFields()] } : { strategy };
    this.overrideChanged.emit({ pattern: overridePatternFor(analysis), override });
  }

  resetToAuto(): void {
    const analysis = this.selected()?.analysis;
    if (analysis) this.overrideChanged.emit({ pattern: overridePatternFor(analysis), override: null });
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
