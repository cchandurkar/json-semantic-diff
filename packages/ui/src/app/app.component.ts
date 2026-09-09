import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { OutputRefSubscription } from '@angular/core';
import type { HowItWorksComponent } from './how-it-works/how-it-works.component';
import { darkMode as sharedDarkMode } from './shared/dark-mode-state';
import { ThemePreference, applyTheme, readStoredTheme, storeTheme } from './shared/theme';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { filter } from 'rxjs';
import { DIFF_EXAMPLES, DiffExample } from './examples';
import { WorkspaceStateService } from './home/workspace-state.service';

const THEME_PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class AppComponent implements OnDestroy, AfterViewInit {
  readonly darkMode = sharedDarkMode;
  readonly themePreference = signal<ThemePreference>('system');
  readonly themeMenuOpen = signal(false);

  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly themeTrigger = viewChild<ElementRef<HTMLButtonElement>>('themeTrigger');
  private readonly themeMenuTemplate = viewChild<TemplateRef<unknown>>('themeMenuTpl');
  private themeOverlayRef?: OverlayRef;
  private exampleRequestedSubscription?: OutputRefSubscription;
  private mediaQueryList?: MediaQueryList;
  private mediaQueryListener?: (event: MediaQueryListEvent) => void;

  private readonly workspace = inject(WorkspaceStateService);

  private readonly applyStoredUiState = afterNextRender(() => {
    const storedPref = readStoredTheme() ?? 'system';
    this.themePreference.set(storedPref);
    const resolved = applyTheme(storedPref);
    this.darkMode.set(resolved === 'dark');

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQueryListener = (event: MediaQueryListEvent) => {
        if (this.themePreference() === 'system') {
          const dark = event.matches;
          this.darkMode.set(dark);
          applyTheme('system');
        }
      };
      if (this.mediaQueryList.addEventListener) {
        this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
      } else if ((this.mediaQueryList as unknown as { addListener: (cb: unknown) => void }).addListener) {
        (this.mediaQueryList as unknown as { addListener: (cb: unknown) => void }).addListener(this.mediaQueryListener);
      }
    }
  });

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (e): e is NavigationEnd | NavigationCancel | NavigationError =>
            e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError
        )
      )
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        const onHowItWorks =
          e instanceof NavigationEnd ? e.urlAfterRedirects.startsWith('/how-it-works') : this.router.url.startsWith('/how-it-works');
        if (!onHowItWorks) {
          this.titleService.setTitle('JSON Semantic Diff — Compare JSON Online with Smart Array Matching');
          this.metaService.updateTag({
            name: 'description',
            content:
              'Free online JSON diff tool that understands what changed, not just where. Compares JSON structurally, matches reordered array records by identity, and never uploads your data - everything runs locally in your browser.'
          });
          this.metaService.updateTag({
            property: 'og:type',
            content: 'website'
          });
          this.metaService.updateTag({
            property: 'og:site_name',
            content: 'JSON Semantic Diff'
          });
          this.metaService.updateTag({
            property: 'og:locale',
            content: 'en_US'
          });
          this.metaService.updateTag({
            name: 'robots',
            content: 'index, follow'
          });
          this.metaService.updateTag({
            property: 'og:url',
            content: 'https://jsonsemanticdiff.dev/'
          });
          this.metaService.updateTag({
            property: 'og:title',
            content: 'JSON Semantic Diff — Compare JSON Online with Smart Array Matching'
          });
          this.metaService.updateTag({
            property: 'og:description',
            content:
              'Free online JSON diff tool that understands what changed, not just where. Compares JSON structurally, matches reordered array records by identity, and never uploads your data.'
          });
          this.metaService.updateTag({
            property: 'og:image',
            content: 'https://jsonsemanticdiff.dev/og-image.png'
          });
          this.metaService.updateTag({
            property: 'og:image:width',
            content: '1639'
          });
          this.metaService.updateTag({
            property: 'og:image:height',
            content: '1223'
          });

          this.metaService.updateTag({
            name: 'twitter:card',
            content: 'summary_large_image'
          });
          this.metaService.updateTag({
            name: 'twitter:title',
            content: 'JSON Semantic Diff — Compare JSON Online with Smart Array Matching'
          });
          this.metaService.updateTag({
            name: 'twitter:description',
            content:
              'Free online JSON diff tool that understands what changed, not just where. Compares JSON structurally, matches reordered array records by identity, and never uploads your data.'
          });
          this.metaService.updateTag({
            name: 'twitter:image',
            content: 'https://jsonsemanticdiff.dev/og-image.png'
          });

          const link = this.doc.querySelector('link[rel="canonical"]');
          if (link) {
            link.setAttribute('href', 'https://jsonsemanticdiff.dev/');
          }
          const howItWorksScript = this.doc.getElementById('how-it-works-jsonld');
          if (howItWorksScript) {
            howItWorksScript.remove();
          }
        }
      });

    effect(() => {
      if (this.themeMenuOpen()) this.attachThemePanel();
      else this.themeOverlayRef?.detach();
    });

    effect(() => {
      if (!this.themeMenuOpen()) return;
      const pane = this.themeOverlayRef?.overlayElement;
      if (pane) setTimeout(() => pane.querySelector<HTMLButtonElement>('button.is-active, button')?.focus());
    });
  }

  ngAfterViewInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const exampleId = params.get('example');
      if (!exampleId) return;
      const found = DIFF_EXAMPLES.find((e) => e.id === exampleId);
      if (found) {
        this.workspace.loadExample(found);
        this.router.navigate([], { replaceUrl: true, queryParams: {} });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.mediaQueryList && this.mediaQueryListener) {
      if (this.mediaQueryList.removeEventListener) {
        this.mediaQueryList.removeEventListener('change', this.mediaQueryListener);
      } else if ((this.mediaQueryList as unknown as { removeListener: (cb: unknown) => void }).removeListener) {
        (this.mediaQueryList as unknown as { removeListener: (cb: unknown) => void }).removeListener(this.mediaQueryListener);
      }
    }
    this.themeOverlayRef?.dispose();
    this.themeOverlayRef = undefined;
    this.exampleRequestedSubscription?.unsubscribe();
  }

  navigateToDiff(): void {
    this.router.navigateByUrl('/');
  }

  onRouteActivate(componentRef: unknown): void {
    const component = componentRef as HowItWorksComponent;
    this.exampleRequestedSubscription = component.exampleRequested?.subscribe((example: DiffExample) => {
      this.workspace.loadExample(example);
      this.navigateToDiff();
    });
  }

  onRouteDeactivate(): void {
    this.exampleRequestedSubscription?.unsubscribe();
    this.exampleRequestedSubscription = undefined;
  }

  onBrandClick(event: MouseEvent): void {
    event.preventDefault();
    if (this.router.url.startsWith('/how-it-works')) {
      this.navigateToDiff();
    } else {
      this.workspace.reset();
    }
  }

  toggleThemeMenu(): void {
    this.themeMenuOpen.update((v) => !v);
  }

  closeThemeMenu(restoreFocus = false): void {
    if (!this.themeMenuOpen()) return;
    this.themeMenuOpen.set(false);
    if (restoreFocus) this.themeTrigger()?.nativeElement.focus();
  }

  setThemePreference(pref: ThemePreference): void {
    this.themePreference.set(pref);
    storeTheme(pref);
    const resolved = applyTheme(pref);
    this.darkMode.set(resolved === 'dark');
    this.closeThemeMenu(true);
  }

  themeLabel(): string {
    const pref = this.themePreference();
    if (pref === 'system') {
      return `System (${this.darkMode() ? 'dark' : 'light'})`;
    }
    return pref;
  }

  onDocumentPointerDown(event: Event): void {
    if (!this.themeMenuOpen()) return;
    const target = event.target as Node;
    if (this.themeTrigger()?.nativeElement.contains(target)) return;
    if (this.themeOverlayRef?.overlayElement.contains(target)) return;
    this.closeThemeMenu(false);
  }

  onEscape(event: Event): void {
    const target = event.target as Element | null;
    if (target?.closest?.('.cdk-overlay-container') && !this.themeOverlayRef?.overlayElement.contains(target)) return;
    if (this.themeMenuOpen()) {
      this.closeThemeMenu(true);
    }
  }

  onThemeMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const pane = this.themeOverlayRef?.overlayElement;
    if (!pane) return;
    const buttons = Array.from(pane.querySelectorAll<HTMLButtonElement>('.theme-menu-item'));
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  private attachThemePanel(): void {
    const trigger = this.themeTrigger()?.nativeElement;
    const tpl = this.themeMenuTemplate();
    if (!trigger || !tpl) return;

    this.themeOverlayRef ??= this.overlay.create({
      panelClass: 'theme-overlay-panel',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(trigger)
        .withPositions(THEME_PANEL_POSITIONS)
        .withPush(true)
        .withViewportMargin(8)
        .withFlexibleDimensions(false)
    });

    if (!this.themeOverlayRef.hasAttached()) {
      this.themeOverlayRef.attach(new TemplatePortal(tpl, this.viewContainer));
    }
  }
}
