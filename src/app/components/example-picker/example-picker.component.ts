import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { DIFF_EXAMPLES, DiffExample } from '../../examples';

/**
 * Small dropdown listing the built-in examples.
 *
 * Deliberately lightweight: a signal-driven panel rather than a CDK overlay,
 * since it never needs to escape its container or reposition.
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
export class ExamplePickerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly examples = input<readonly DiffExample[]>(DIFF_EXAMPLES);
  readonly label = input('Examples');
  /** `secondary` matches the empty-state button; `link` matches the header nav. */
  readonly variant = input<'link' | 'secondary'>('link');
  /** Which edge the panel is anchored to, so it never overflows the viewport. */
  readonly align = input<'left' | 'right'>('left');
  readonly exampleSelected = output<DiffExample>();

  readonly open = signal(false);

  constructor() {
    // Move focus into the panel when it opens, so the keyboard path is immediate.
    effect(() => {
      if (!this.open()) return;
      const panel = this.panel();
      if (panel) queueMicrotask(() => panel.nativeElement.querySelector('button')?.focus());
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

  select(example: DiffExample): void {
    this.close();
    this.exampleSelected.emit(example);
  }

  onDocumentPointerDown(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
