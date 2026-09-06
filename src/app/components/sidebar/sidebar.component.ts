import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { DiffExample } from '../../examples';
import { MatchingOverrideChange } from '../../shared/node-actions';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { ArrayMatchingComponent, ArrayMatchingContext } from '../array-matching/array-matching.component';
import { ExamplePickerComponent } from '../example-picker/example-picker.component';

/**
 * Persistent left rail holding everything that configures a comparison:
 * examples, view/normalization toggles, ignore rules and array matching.
 *
 * Above the drawer breakpoint it is a sticky grid column. Below it, the panel
 * becomes an off-canvas drawer behind a toggle button, driven purely by a
 * signal - no overlay container is needed because the panel has no anchor to
 * track and never has to escape a clipping ancestor.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [ArrayMatchingComponent, ExamplePickerComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape($event)'
  }
})
export class SidebarComponent {
  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  /** Comparison toggles, owned by the app. */
  readonly normalizeTimestamps = input(false);
  readonly normalizeNumbers = input(false);
  readonly nullEqualsMissing = input(false);
  /** Ignore rules currently in force. */
  readonly ignorePaths = input<readonly string[]>([]);
  /** Arrays available to configure; empty before the first comparison. */
  readonly arrays = input<readonly ArrayMatchingContext[]>([]);
  /** Externally-driven array selection, e.g. from a Tree match-pill click. */
  readonly selectedAnalysisPath = input<string | null>(null);
  /** Whether a comparison exists at all, which gates the matching section. */
  readonly hasResult = input(false);

  readonly exampleSelected = output<DiffExample>();
  readonly normalizeTimestampsChange = output<boolean>();
  readonly normalizeNumbersChange = output<boolean>();
  readonly nullEqualsMissingChange = output<boolean>();
  readonly ignoreAdded = output<string>();
  readonly ignoreRemoved = output<string>();
  readonly overrideChanged = output<MatchingOverrideChange>();
  /** Fired when the user picks a different array via the matching section's own select. */
  readonly arraySelected = output<string>();

  /** Drawer state; only meaningful below the breakpoint, where the toggle shows. */
  readonly open = signal(false);

  constructor() {
    // Loading an example from the drawer should reveal the result behind it.
    effect(() => {
      this.hasResult();
      this.close();
    });
  }

  toggle(): void {
    this.open.update(value => !value);
  }

  /**
   * Escape closes the drawer, unless it was pressed inside a CDK overlay - a
   * dropdown, menu or tooltip owns its own Escape and should not also collapse
   * the drawer behind it.
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

  /** Reads the new state off a checkbox change event. */
  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  addIgnoreRule(input: HTMLInputElement): void {
    const rule = input.value.trim();
    if (!rule) return;
    this.ignoreAdded.emit(rule);
    input.value = '';
  }
}
