import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';

/**
 * Comparison settings dropdown for the diff toolbar.
 *
 * Uses the ARIA disclosure pattern rather than a menu: the panel holds native
 * checkboxes, not menu commands, so plain Tab navigation and native checkbox
 * semantics are both simpler and more accurate than `role="menu"` would be.
 *
 * Open/close mechanics mirror `ExamplePickerComponent`. The small duplication is
 * deliberate - the two differ in trigger markup, panel semantics and focus
 * target, so a shared abstraction would be mostly configuration.
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
export class SettingsMenuComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Pure view filter owned by the app: toggling it must never recompare. */
  readonly changesOnly = input(true);
  readonly normalizeTimestamps = input(false);
  readonly normalizeNumbers = input(false);

  readonly changesOnlyChange = output<boolean>();
  readonly normalizeTimestampsChange = output<boolean>();
  readonly normalizeNumbersChange = output<boolean>();

  readonly open = signal(false);

  constructor() {
    // Move focus into the panel when it opens, so the keyboard path is immediate.
    effect(() => {
      if (!this.open()) return;
      const panel = this.panel();
      if (panel) queueMicrotask(() => panel.nativeElement.querySelector('input')?.focus());
    });
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
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** Reads the new state off a checkbox change event. */
  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
