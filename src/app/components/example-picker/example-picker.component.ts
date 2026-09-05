import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, TemplateRef, ViewContainerRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { DIFF_EXAMPLES, DiffExample } from '../../examples';

/**
 * Preference order: drop below the trigger, flipping above only when there is
 * not enough room. The trigger sits at the top of the sidebar, so below is
 * almost always right.
 */
const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
];

/**
 * Dropdown listing the built-in examples, sized for the sidebar column.
 *
 * The panel renders through the CDK overlay rather than as an absolutely
 * positioned child: the sidebar is `overflow-y:auto`, which would clip it. Uses
 * the imperative `Overlay.create` API - the same one the tooltip already pulls
 * in - because the declarative `CdkConnectedOverlay` directives cost roughly ten
 * times as much bundle weight for the same result.
 *
 * The portal keeps this component's `ViewContainerRef`, so the panel stays part
 * of this view and its encapsulated styles still apply.
 */
@Component({
  selector: 'app-example-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './example-picker.component.html',
  styleUrl: './example-picker.component.css',
  host: {
    '(document:keydown.escape)': 'close(true)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class ExamplePickerComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelTemplate = viewChild.required<TemplateRef<unknown>>('panelTpl');
  private overlayRef?: OverlayRef;

  readonly label = input('Load example');
  readonly exampleSelected = output<DiffExample>();

  readonly examples = DIFF_EXAMPLES;
  readonly open = signal(false);

  constructor() {
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
    this.open.update(value => !value);
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  select(example: DiffExample): void {
    this.close();
    this.exampleSelected.emit(example);
  }

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
      panelClass: 'example-overlay-panel',
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
