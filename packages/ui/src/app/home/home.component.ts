import {
  AnimationCallbackEvent,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { JsonInputComponent } from '../components/json-input/json-input.component';
import { DiffTreeComponent } from '../components/diff-tree/diff-tree.component';
import { AnalysisPanelComponent } from '../components/analysis-panel/analysis-panel.component';
import { SourceDiffComponent } from '../components/source-diff/source-diff.component';
import { SearchControlComponent } from '../components/search-control/search-control.component';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { ToastComponent } from '../components/toast/toast.component';
import { darkMode as sharedDarkMode } from '../shared/dark-mode-state';
import {
  ANALYSIS_PANEL_DEFAULT_WIDTH,
  ANALYSIS_PANEL_MAX_WIDTH,
  ANALYSIS_PANEL_MIN_WIDTH,
  clampWidth,
  readStoredAnalysisPanelCollapsed,
  readStoredAnalysisPanelWidth,
  storeAnalysisPanelCollapsed,
  storeAnalysisPanelWidth
} from '../shared/resizable-panel';
import { WorkspaceStateService } from './workspace-state.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    JsonInputComponent,
    DiffTreeComponent,
    SourceDiffComponent,
    SidebarComponent,
    AnalysisPanelComponent,
    ToastComponent,
    SearchControlComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  readonly darkMode = sharedDarkMode;

  readonly workspace = inject(WorkspaceStateService);

  readonly analysisPanelWidth = signal(ANALYSIS_PANEL_DEFAULT_WIDTH);
  readonly resizingAnalysisPanel = signal(false);

  /**
   * Below the drawer breakpoints, `<app-sidebar>`/`<app-analysis-panel>` no
   * longer render their own trigger buttons - two lone buttons stranded at
   * opposite edges of the screen, each in its own full-height flex column,
   * read as bolted-on rather than intentional. Both triggers live together
   * here instead, in `.mobile-panel-bar`, and drive each panel's drawer via
   * `[(open)]`. See SidebarComponent's doc comment for the full rationale.
   */
  readonly sidebarDrawerOpen = signal(false);
  readonly analysisDrawerOpen = signal(false);

  private readonly sidebarToggleButton = viewChild<ElementRef<HTMLButtonElement>>('sidebarToggleButton');
  private readonly analysisToggleButton = viewChild<ElementRef<HTMLButtonElement>>('analysisToggleButton');

  /**
   * Collapsing hides the panel without discarding `analysisPanelWidth` - the
   * width the user dragged it to is preserved so expanding (via the handle's
   * chevron, or by dragging the handle itself) restores exactly what they
   * had. Kept separate from `analysisPanelWidth` rather than overloading it
   * with a 0 sentinel, which would lose that width on collapse.
   */
  /**
   * Starts `false` even though the persisted value may be `true` - this
   * component is hydrated from build-time-prerendered HTML (see
   * AGENTS.md's Prerendering section), which has no `localStorage` and
   * always bakes in `false`. Starting from the real stored value here would
   * make the client's first render disagree with that prerendered DOM and
   * trip an Angular hydration mismatch. The inline script in `src/index.html`
   * (`data-analysis-panel-collapsed`) is what actually prevents the reload
   * flash, via a pure CSS override that doesn't touch what Angular thinks is
   * rendered - mirroring the `tourSeen`/theme scripts there. This signal is
   * then corrected to the real value below, once hydration has settled.
   */
  readonly analysisPanelCollapsed = signal(false);

  /** What the panel's `[style.width.px]` actually renders: 0 while collapsed, the real width otherwise. */
  readonly effectiveAnalysisPanelWidth = computed(() => (this.analysisPanelCollapsed() ? 0 : this.analysisPanelWidth()));

  private panelResizeStartX = 0;
  private panelResizeStartWidth = 0;

  private readonly applyStoredPanelState = afterNextRender(() => {
    const storedWidth = readStoredAnalysisPanelWidth();
    if (storedWidth !== null) {
      this.analysisPanelWidth.set(clampWidth(storedWidth, ANALYSIS_PANEL_MIN_WIDTH, ANALYSIS_PANEL_MAX_WIDTH));
    }
    this.analysisPanelCollapsed.set(readStoredAnalysisPanelCollapsed());
    // The pre-hydration script in `index.html` injects a temporary global
    // `<style id="analysis-panel-width-override">` tag so a reload never
    // flashes the default width before snapping to the real one. Now that
    // Angular's own signal has been corrected to that same value above, the
    // override has done its job - remove it so it never pins a later
    // user-driven resize to a stale width.
    document.getElementById('analysis-panel-width-override')?.remove();
  });

  private readonly navigatingToHowItWorks = signal(false);

  constructor() {
    // The pre-hydration script in `index.html` sets `data-analysis-panel-collapsed`
    // once, before Angular ever runs, purely to avoid a reload flash (see the
    // signal's doc comment above). Nothing then updates that attribute again -
    // so without this effect, expanding the panel afterwards (chevron or drag)
    // would leave the stale attribute in place, and the global `!important`
    // CSS override keyed off it (in `src/styles.css`) would keep pinning the
    // panel to width 0 forever. This effect keeps the attribute in sync with
    // the real signal for the rest of the page's lifetime.
    effect(() => {
      const collapsed = this.analysisPanelCollapsed();
      if (typeof document === 'undefined') return;
      if (collapsed) {
        document.documentElement.dataset['analysisPanelCollapsed'] = 'true';
      } else {
        delete document.documentElement.dataset['analysisPanelCollapsed'];
      }
    });

    const router = inject(Router);
    router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        if (e.url.startsWith('/how-it-works')) this.navigatingToHowItWorks.set(true);
      });

    router.events
      .pipe(
        filter(
          (e): e is NavigationEnd | NavigationCancel | NavigationError =>
            e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError
        )
      )
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        const goingToHowItWorks =
          e instanceof NavigationEnd ? e.urlAfterRedirects.startsWith('/how-it-works') : router.url.startsWith('/how-it-works');
        this.navigatingToHowItWorks.set(goingToHowItWorks);
      });
  }

  onHeroLeave(event: AnimationCallbackEvent): void {
    if (this.navigatingToHowItWorks()) {
      event.animationComplete();
      return;
    }
    const el = event.target as HTMLElement;
    const onEnd = () => {
      el.removeEventListener('animationend', onEnd);
      event.animationComplete();
    };
    el.addEventListener('animationend', onEnd);
    el.classList.add('hero-leave');
  }

  startPanelResize(event: PointerEvent): void {
    event.preventDefault();
    // Dragging a collapsed handle re-expands it: unhide first so the drag
    // resizes from the panel's last real width instead of the 0 it's
    // rendering at, which would otherwise make the first pixels of the drag
    // do nothing.
    if (this.analysisPanelCollapsed()) {
      this.analysisPanelCollapsed.set(false);
      storeAnalysisPanelCollapsed(false);
    }
    this.panelResizeStartX = event.clientX;
    this.panelResizeStartWidth = this.analysisPanelWidth();
    this.resizingAnalysisPanel.set(true);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPanelResizeMove(event: PointerEvent): void {
    if (!this.resizingAnalysisPanel()) return;
    const delta = this.panelResizeStartX - event.clientX;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : ANALYSIS_PANEL_MAX_WIDTH;
    const maxWidth = Math.min(ANALYSIS_PANEL_MAX_WIDTH, viewportWidth * 0.4);
    this.analysisPanelWidth.set(clampWidth(this.panelResizeStartWidth + delta, ANALYSIS_PANEL_MIN_WIDTH, maxWidth));
  }

  endPanelResize(event: PointerEvent): void {
    if (!this.resizingAnalysisPanel()) return;
    this.resizingAnalysisPanel.set(false);
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    storeAnalysisPanelWidth(this.analysisPanelWidth());
  }

  /** The handle's chevron button: collapses/expands without touching the stored width. */
  toggleAnalysisPanelCollapsed(): void {
    const next = !this.analysisPanelCollapsed();
    this.analysisPanelCollapsed.set(next);
    storeAnalysisPanelCollapsed(next);
  }

  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** SidebarComponent emits this when Escape/its own "×" close the drawer; see its doc comment. */
  restoreSidebarToggleFocus(): void {
    this.sidebarToggleButton()?.nativeElement.focus();
  }

  /** AnalysisPanelComponent emits this when Escape/its own "×" close the drawer; see its doc comment. */
  restoreAnalysisToggleFocus(): void {
    this.analysisToggleButton()?.nativeElement.focus();
  }
}
