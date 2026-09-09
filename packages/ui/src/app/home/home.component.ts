import { AnimationCallbackEvent, ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
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
  readStoredAnalysisPanelWidth,
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

  private panelResizeStartX = 0;
  private panelResizeStartWidth = 0;

  private readonly applyStoredPanelWidth = afterNextRender(() => {
    const storedWidth = readStoredAnalysisPanelWidth();
    if (storedWidth !== null) {
      this.analysisPanelWidth.set(clampWidth(storedWidth, ANALYSIS_PANEL_MIN_WIDTH, ANALYSIS_PANEL_MAX_WIDTH));
    }
  });

  private readonly navigatingToHowItWorks = signal(false);

  constructor() {
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

  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
