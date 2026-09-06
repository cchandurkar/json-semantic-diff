import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ArrayMatchAnalysis } from '../../core/diff';
import { describeArrayMatch } from './array-picker-hint';

/**
 * Preference order: drop below the trigger, flipping above only when there is
 * not enough room. Matches `ExamplePickerComponent`'s positions exactly - both
 * triggers sit at the top of their respective containers.
 */
const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
];

/**
 * Rich array-selection dropdown shared by the sidebar's Array matching section
 * and the analysis panel. Replaces a plain native `<select>` in both places
 * with a list that also shows each array's matching hint, so switching arrays
 * doesn't require memorizing which one had which key.
 *
 * Built on the imperative `Overlay.create` + `TemplatePortal` pattern already
 * established by `ExamplePickerComponent` - both a sidebar section and the
 * analysis panel are `overflow-y:auto` columns, which would clip an absolutely
 * positioned panel, and the declarative `CdkConnectedOverlay` directives cost
 * roughly ten times as much bundle weight for the same result.
 *
 * Selection follows the same externally-driven / user-driven split used by
 * `ArrayMatchingComponent` and `AnalysisPanelComponent`: `selectedPath` is the
 * parent's current pick (Tree match-pill, the other picker, etc.) and is only
 * ever read into the local `chosenPath`, never written back to; `pathSelected`
 * fires only when the user picks an item from THIS component's own panel. That
 * asymmetry is what keeps the two pickers (and the Tree) from re-triggering
 * each other.
 */
@Component({
  selector: 'app-array-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './array-picker.component.html',
  styleUrl: './array-picker.component.css',
  host: {
    '(document:keydown.escape)': 'close(true)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class ArrayPickerComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelTemplate = viewChild.required<TemplateRef<unknown>>('panelTpl');
  private overlayRef?: OverlayRef;

  readonly arrays = input.required<readonly ArrayMatchAnalysis[]>();
  /** An externally-driven selection, e.g. from a Tree match-pill click or the other picker. */
  readonly selectedPath = input<string | null>(null);
  /** Fired only when the USER picks an item from this picker's own panel. */
  readonly pathSelected = output<string>();

  readonly open = signal(false);
  /** Set optimistically on the user's own pick; reconciled from `selectedPath` otherwise. */
  private readonly chosenPath = signal<string | null>(null);

  /** What the trigger shows: the user's own pick wins, falling back to the first array. */
  readonly triggerPath = computed<string | null>(() => {
    const chosen = this.chosenPath();
    if (chosen !== null) return chosen;
    const external = this.selectedPath();
    if (external !== null) return external;
    const list = this.arrays();
    // An explicit length check (rather than `list[0]?.path`) keeps this honestly
    // typed `string | null` - TS otherwise infers plain array indexing as always
    // defined, which would make the template's fallback look like dead code.
    return list.length > 0 ? list[0].path : null;
  });

  constructor() {
    // An externally-driven selection takes over the local choice. Guarded to
    // only fire on an actual change, so this never re-triggers itself and
    // never fights the user's own picks - the same pattern used by
    // ArrayMatchingComponent's and AnalysisPanelComponent's chosenPath effects.
    effect(() => {
      const incoming = this.selectedPath();
      if (incoming !== null && incoming !== this.chosenPath()) this.chosenPath.set(incoming);
    });

    effect(() => {
      if (this.open()) this.attachPanel();
      else this.overlayRef?.detach();
    });

    // Move focus into the panel once the embedded view has rendered.
    effect(() => {
      if (!this.open()) return;
      const pane = this.overlayRef?.overlayElement;
      if (pane) setTimeout(() => pane.querySelector('button')?.focus());
    });
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  select(path: string): void {
    this.chosenPath.set(path);
    this.close();
    this.pathSelected.emit(path);
  }

  isSelected(path: string): boolean {
    return path === this.triggerPath();
  }

  /** Re-exported for the template; the wording is a pure function, not component state. */
  readonly describeArrayMatch = describeArrayMatch;

  onDocumentPointerDown(event: Event): void {
    if (!this.open()) return;
    const target = event.target as Node;
    // The trigger is handled by its own click, which toggles.
    if (this.host.nativeElement.contains(target)) return;
    // The panel lives in the overlay container, outside this host.
    if (this.overlayRef?.overlayElement.contains(target)) return;
    this.close();
  }

  private attachPanel(): void {
    this.overlayRef ??= this.overlay.create({
      panelClass: 'array-picker-overlay-panel',
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
}
