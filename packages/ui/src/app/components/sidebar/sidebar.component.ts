import { ChangeDetectionStrategy, Component, afterNextRender, effect, input, model, output, signal } from '@angular/core';
import { isValidIgnorePattern } from 'json-semantic-diff';
import { version } from '../../../../package.json';
import { DiffExample } from '../../examples';
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
 * becomes an off-canvas drawer, driven by the `open` model() - no overlay
 * container is needed because the panel has no anchor to track and never has
 * to escape a clipping ancestor. The trigger button that opens it lives in
 * HomeComponent's shared mobile panel bar (`.mobile-panel-bar`), not here:
 * a lone "Setup" button at one edge of the screen and a lone "Analysis"
 * button at the other, each stranded in its own full-height flex column,
 * read as bolted-on rather than a single deliberate control surface. Housing
 * both triggers together lets them share one small toolbar instead.
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

  /**
   * Drawer state; only meaningful below the breakpoint, where the trigger
   * button shows. A model() rather than a plain signal so the mobile trigger
   * button - which lives in HomeComponent's shared panel bar, not here, see
   * that component's doc comment - can drive it via `[(open)]`.
   */
  readonly open = model(false);

  /**
   * Escape and the drawer's own "×" close the drawer AND should return focus
   * to the external trigger button; HomeComponent listens for this to do
   * that, since it owns that button and this component has no reference to
   * it. Loading an example / the guided tour's own close()/toggle() calls
   * deliberately don't emit this - focus already belongs somewhere sensible
   * in those cases (the example picker, a tour popover).
   */
  readonly restoreFocusRequested = output<void>();

  /** Inline validation error for the ignore path input. */
  readonly ignoreError = signal<string | null>(null);

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
    this.closeAndRestoreFocus();
  }

  close(): void {
    this.open.set(false);
  }

  closeAndRestoreFocus(): void {
    if (!this.open()) return;
    this.close();
    this.restoreFocusRequested.emit();
  }

  /** Reads the new state off a checkbox change event. */
  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  clearIgnoreError(): void {
    if (this.ignoreError()) {
      this.ignoreError.set(null);
    }
  }

  addIgnoreRule(input: HTMLInputElement): void {
    const rule = input.value.trim();
    if (!rule) return;
    if (!isValidIgnorePattern(rule)) {
      this.ignoreError.set('Path pattern must start with $ (e.g. $.field or $.array[*].field)');
      return;
    }
    this.ignoreError.set(null);
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

    // Dynamic import inside click handler to keep driver.js out of the initial bundle
    const { driver } = await import('driver.js');

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
            description:
              "Once you've entered two JSON documents, click Compare to trigger the semantic diff engine, inferring object identities and detecting reordered elements. For now, let's load a built-in example instead.",
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: '[data-tour="load-example-chip"]',
          popover: {
            title: 'Load a Built-in Example',
            description:
              'Click Next to instantly load a built-in example — a realistic API response with added, removed, and modified fields — so you can see this tool in action without pasting anything.',
            side: 'bottom',
            align: 'start',
            onNextClick: async () => {
              if (isMobile) {
                this.close();
              }
              const chip = document.querySelector<HTMLButtonElement>('[data-tour="load-example-chip"]');
              if (chip) {
                chip.click();
              }
              // Give the worker-based diff time to finish and render before advancing to the next step,
              // which queries the resulting tree DOM.
              await new Promise((resolve) => setTimeout(resolve, 350));
              driverObj.moveNext();
            }
          }
        },
        {
          element: () =>
            document.querySelector('.diff-row:has(.match-pill)') ??
            document.querySelector('.match-pill') ??
            document.querySelector('[data-tour="tree-view"]') ??
            document.body,
          popover: {
            title: 'Semantic Diff Tree',
            description:
              'Notice the matching badge on the array row. The semantic diff engine tracked items across position shifts instead of generating false additions and removals.',
            side: 'top',
            align: 'start'
          },
          onHighlightStarted: () => {
            const treeTab = document.querySelector<HTMLButtonElement>('[data-tour="tree-tab"]');
            if (treeTab && treeTab.getAttribute('aria-selected') !== 'true') {
              treeTab.click();
            }
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
            // Live selection demonstration: programmatically select the matched array row in the diff tree
            const matchedRow =
              document.querySelector<HTMLElement>('.diff-row:has(.match-pill)') ?? document.querySelector<HTMLElement>('.diff-row');
            if (matchedRow) {
              const label = matchedRow.querySelector<HTMLElement>('.label');
              if (label) {
                label.click();
              } else {
                matchedRow.click();
              }
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
              'Below the breakdown, the Analysis panel explains candidate scores, uniqueness, and completeness for the selected array, explaining why it matched records by their inferred keys.',
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
              'The sidebar stays synchronized too: selecting an array in the tree also selects it here in the Array matching picker, where you can inspect candidate keys or override the strategy.',
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
          element: '[data-tour="list-tab"]',
          popover: {
            title: 'Flat List View',
            description:
              'Prefer a scannable, flat list instead of nesting? List view shows every changed path in one column with its old → new value in the next, no drilling into the tree required.',
            side: 'bottom',
            align: 'start'
          },
          onHighlightStarted: () => {
            if (isMobile) {
              this.close();
            }
            const listTab = document.querySelector<HTMLButtonElement>('[data-tour="list-tab"]');
            if (listTab) {
              listTab.click();
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
          element: '[data-tour="export-button"]',
          popover: {
            title: 'Export Diff Reports',
            description:
              'Export your comparison anytime as a self-contained HTML report with live themes and visual fidelity, or as a cleanly formatted Markdown table.',
            side: 'left',
            align: 'end'
          },
          onHighlightStarted: () => {
            if (isMobile) {
              this.close();
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
