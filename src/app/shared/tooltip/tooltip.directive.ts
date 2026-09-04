import { Directive, ElementRef, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { TooltipComponent } from './tooltip.component';

export type TooltipPosition = 'above' | 'below';

/** Per-instance ids, so several tooltips can coexist without colliding. */
let nextTooltipId = 0;

const ABOVE: ConnectedPosition = { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 };
const BELOW: ConnectedPosition = { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 };
const RIGHT: ConnectedPosition = { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 };
const LEFT: ConnectedPosition = { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 };

const SHOW_DELAY_MS = 180;

/**
 * Lightweight hover/focus tooltip built on the CDK overlay.
 *
 * Rendered in the body-level overlay container, so it is never clipped by the
 * sticky toolbar or by any `overflow` ancestor.
 *
 * NOTE for disabled controls: a disabled `<button>` dispatches no pointer
 * events, so put this directive on a wrapper element and give the disabled
 * button `pointer-events:none` so the pointer reaches the wrapper.
 */
@Directive({
  selector: '[appTooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    // focusin/focusout bubble, so this also fires for a focusable child.
    '(focusin)': 'show(true)',
    '(focusout)': 'hide()',
    '(document:keydown.escape)': 'hide()',
    '[attr.aria-describedby]': 'describedBy()'
  }
})
export class TooltipDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);

  readonly appTooltip = input('');
  readonly tooltipPosition = input<TooltipPosition>('above');

  private readonly id = `app-tooltip-${nextTooltipId++}`;
  private readonly visible = signal(false);
  private overlayRef?: OverlayRef;
  private timer?: ReturnType<typeof setTimeout>;

  /** Only advertised while the tooltip is actually in the DOM. */
  protected readonly describedBy = computed(() => (this.visible() ? this.id : null));

  constructor() {
    // Keep a visible tooltip in sync if its text changes underneath it.
    effect(() => {
      const text = this.appTooltip();
      if (!this.visible()) return;
      if (!text.trim()) this.hide();
    });
  }

  show(immediate = false): void {
    if (!this.appTooltip().trim() || this.visible()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attach(), immediate ? 0 : SHOW_DELAY_MS);
  }

  hide(): void {
    clearTimeout(this.timer);
    if (!this.visible()) return;
    this.visible.set(false);
    this.overlayRef?.detach();
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  private attach(): void {
    const text = this.appTooltip().trim();
    if (!text) return;

    this.overlayRef ??= this.createOverlay();
    const ref = this.overlayRef;
    if (ref.hasAttached()) ref.detach();

    const component = ref.attach(new ComponentPortal(TooltipComponent));
    component.setInput('text', text);
    component.setInput('tooltipId', this.id);
    this.visible.set(true);
  }

  private createOverlay(): OverlayRef {
    const preferred = this.tooltipPosition() === 'below' ? [BELOW, ABOVE] : [ABOVE, BELOW];
    return this.overlay.create({
      panelClass: 'difflens-tooltip',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([...preferred, RIGHT, LEFT])
        .withPush(true)
    });
  }
}
