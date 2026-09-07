import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, effect, input, output, signal, viewChild } from '@angular/core';
import { version } from '../../../../package.json';
import { DIFF_EXAMPLES, DiffExample } from '../../examples';
import { MatchingOverrideChange } from '../../shared/node-actions';
import { readTourSeen, storeTourDismissed, storeTourStarted } from '../../shared/tour-storage';
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
  readonly version = version;

  private readonly toggleButton = viewChild.required<ElementRef<HTMLButtonElement>>('toggleButton');

  /** Comparison toggles, owned by the app. */
  readonly normalizeTimestamps = input(false);
  readonly numericStringsAsNumbers = input(false);
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
  readonly numericStringsAsNumbersChange = output<boolean>();
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
    this.open.update((value) => !value);
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

  /**
   * Always starts false so server-prerendered HTML and the client's initial
   * hydration state match (same reasoning as AppComponent's darkMode/
   * analysisPanelWidth signals - seeding this directly from storage would
   * make the two initial renders diverge for any returning visitor who has
   * already seen the tour, which Angular would detect as a hydration
   * mismatch). The real "already seen" state is applied via afterNextRender
   * below, once hydration has already completed.
   */
  readonly tourDismissed = signal(false);

  private readonly hideTourIfAlreadySeen = afterNextRender(() => {
    if (readTourSeen()) this.tourDismissed.set(true);
  });

  dismissTour(): void {
    this.tourDismissed.set(true);
    storeTourDismissed();
  }

  async startTour(): Promise<void> {
    storeTourStarted();
    if (typeof window === 'undefined') return;

    const example = DIFF_EXAMPLES.find((e) => e.id === 'reordered-users');
    if (example) {
      this.exampleSelected.emit(example);
    }

    // Dynamic import inside click handler to keep driver.js out of the initial bundle
    const { driver } = await import('driver.js');

    // Wait for the example comparison to run and render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Close the mobile drawer if open so the workspace is visible
    this.close();

    const isNarrow = window.innerWidth <= 1280;
    const isMobile = window.innerWidth <= 1100;

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgb(10 14 22 / 0.72)',
      onDestroyed: () => {
        if (isMobile) {
          this.close();
        }
      },
      steps: [
        {
          element: '[data-tour="json-editors"]',
          popover: {
            title: 'JSON Input Editors',
            description: 'Paste, load, or type original and modified JSON documents here. Formatting and validation occur automatically.',
            side: 'bottom',
            align: 'start'
          }
        },
        {
          element: '[data-tour="compare-button"]',
          popover: {
            title: 'Compare JSON',
            description: 'Click Compare to trigger the semantic diff engine, inferring object identities and detecting reordered elements.',
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: document.querySelector('[data-node-id="$.users"]') ?? '[data-tour="tree-view"]',
          popover: {
            title: 'Semantic Diff Tree',
            description:
              'Notice the "Matched by userId" pill on the users array. DiffLens tracked Carol and Bob across position shifts instead of generating false additions and removals.',
            side: 'top',
            align: 'start'
          }
        },
        {
          element: isNarrow ? '[data-tour="analysis-toggle"]' : '[data-tour="changes-by-area"]',
          popover: {
            title: 'Selection Sync: Changes by Area',
            description:
              'Selecting an array or object row in the tree immediately syncs here. The Changes by area breakdown highlights the selected area and shows where modifications are clustered.',
            side: 'left',
            align: 'start'
          },
          onHighlightStarted: () => {
            // Live selection demonstration: programmatically select the users array row in the diff tree
            const labelBtn = document.querySelector<HTMLButtonElement>('[data-node-id="$.users"] .label');
            if (labelBtn) {
              labelBtn.click();
            }
            if (isNarrow) {
              const toggle = document.querySelector<HTMLButtonElement>('[data-tour="analysis-toggle"]');
              if (toggle && toggle.getAttribute('aria-expanded') !== 'true') {
                toggle.click();
              }
            }
          }
        },
        {
          element: isNarrow ? '[data-tour="analysis-toggle"]' : '[data-tour="analysis-explanation"]',
          popover: {
            title: 'Identity Analysis & Scores',
            description:
              'Below the breakdown, the Analysis panel explains candidate scores, uniqueness, and completeness for the selected array, explaining why it matched records by userId.',
            side: 'left',
            align: 'start'
          },
          onHighlightStarted: () => {
            if (isNarrow) {
              const toggle = document.querySelector<HTMLButtonElement>('[data-tour="analysis-toggle"]');
              if (toggle && toggle.getAttribute('aria-expanded') !== 'true') {
                toggle.click();
              }
            }
          }
        },
        {
          element: '[data-tour="sidebar-config"]',
          popover: {
            title: 'Comparison Options',
            description:
              'Control how comparisons work: normalize timestamps and numeric strings, treat null and missing as equal, or ignore noisy paths entirely.',
            side: 'right',
            align: 'start'
          },
          onHighlightStarted: () => {
            if (isMobile) {
              this.toggle();
            }
          }
        },
        {
          element: '[data-tour="array-matching"]',
          popover: {
            title: 'Sidebar Array Matching Sync',
            description:
              'The sidebar stays synchronized too: selecting users in the tree also selected it here in the Array matching picker, where you can inspect candidate keys or override the strategy.',
            side: 'right',
            align: 'start'
          },
          onHighlightStarted: () => {
            if (isMobile) {
              this.toggle();
            }
          }
        },
        {
          element: '[data-tour="source-tab"]',
          popover: {
            title: 'Side-by-Side Source View',
            description: 'Prefer code lines? Toggle to Source view anytime for a side-by-side two-pane view with intra-line word diffs.',
            side: 'bottom',
            align: 'start'
          },
          onHighlightStarted: () => {
            if (isMobile) {
              this.close();
            }
            const sourceTab = document.querySelector<HTMLButtonElement>('[data-tour="source-tab"]');
            if (sourceTab) {
              sourceTab.click();
            }
          }
        },
        {
          popover: {
            title: "You're All Set!",
            description:
              'Load any of the built-in examples or paste your own JSON to explore semantic diffing. Everything runs 100% locally in your browser.'
          }
        }
      ]
    });

    driverObj.drive();
  }
}
