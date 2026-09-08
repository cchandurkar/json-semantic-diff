import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { JsonInputComponent } from './components/json-input/json-input.component';
import { DiffTreeComponent } from './components/diff-tree/diff-tree.component';
import { AnalysisPanelComponent } from './components/analysis-panel/analysis-panel.component';
import { SourceDiffComponent } from './components/source-diff/source-diff.component';
import { SearchControlComponent } from './components/search-control/search-control.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ToastComponent } from './components/toast/toast.component';
import { ArrayMatchingContext } from './components/array-matching/array-matching.component';
import { ArrayMatchAnalysis, DEFAULT_DIFF_OPTIONS, DiffOptions, DiffResult, JsonValue, diffJson } from 'json-semantic-diff';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatJson } from './shared/format-json';
import { findNodeById, findNodeByPath, stepChange, subtreeIds } from './shared/node-navigation';
import { buildSearchIndex, searchDiff, stepSearchResult } from './shared/search-index';
import {
  MatchingOverrideChange,
  NodeActionEvent,
  applyOverrideToOptions,
  ignoreFieldEverywhereRule,
  ignoreThisPathRule,
  matchingKeyOverride
} from './shared/node-actions';
import { ClipboardService } from './shared/clipboard/clipboard.service';
import { formatChange, formatNewValue, formatOldValue, formatSemanticPath, formatSubtree } from './shared/clipboard/diff-clipboard';
import { ToastMessage, createToast } from './shared/toast';
import { ThemePreference, applyTheme, readStoredTheme, storeTheme } from './shared/theme';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  ANALYSIS_PANEL_DEFAULT_WIDTH,
  ANALYSIS_PANEL_MAX_WIDTH,
  ANALYSIS_PANEL_MIN_WIDTH,
  clampWidth,
  readStoredAnalysisPanelWidth,
  storeAnalysisPanelWidth
} from './shared/resizable-panel';
import { flattenChanges } from './source';
import { DIFF_EXAMPLES, DiffExample } from './examples';

const EDITOR_HEIGHT_DEFAULT = 260;
const EDITOR_HEIGHT_COMPACT = 170;
/** How long a toast stays up; longer when it offers an undo. */
const TOAST_MS = 2400;
const TOAST_UNDO_MS = 5000;

const THEME_PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterOutlet,
    JsonInputComponent,
    DiffTreeComponent,
    SourceDiffComponent,
    SidebarComponent,
    AnalysisPanelComponent,
    ToastComponent,
    SearchControlComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class AppComponent implements OnDestroy {
  readonly leftText = signal('');
  readonly rightText = signal('');
  readonly leftError = signal<string | null>(null);
  readonly rightError = signal<string | null>(null);
  readonly result = signal<DiffResult | null>(null);
  readonly dirty = signal(false);
  readonly selectedAnalysis = signal<ArrayMatchAnalysis | null>(null);
  /**
   * Always starts false/light so server-prerendered HTML and the client's
   * initial hydration state match exactly (readStoredTheme() is guarded to
   * return null during prerendering, but returns the real value in a real
   * browser - seeding this directly from storage would make the two initial
   * renders diverge for any user with a saved dark preference, which Angular
   * detects as a hydration mismatch and resolves by destroying/recreating
   * the affected DOM - visible as a brief "duplicate page" flash). The real
   * stored value is applied via afterNextRender below, after hydration has
   * already completed, which is a normal post-hydration update instead.
   */
  readonly darkMode = signal(false);
  readonly themePreference = signal<ThemePreference>('system');
  readonly themeMenuOpen = signal(false);
  readonly editorHeight = signal(EDITOR_HEIGHT_DEFAULT);
  readonly options = signal<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });
  /** Pure render filter: never round-trips through the engine. */
  readonly changesOnly = signal(true);
  /** Tree and Source are two renderers over one result; switching never recomputes the diff. */
  readonly view = signal<'tree' | 'source'>('source');
  /** Single selection shared by both views, keyed on the canonical DiffNode.id. */
  readonly selectedNodeId = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly searchResultIndex = signal(0);
  readonly toast = signal<ToastMessage | null>(null);
  /**
   * Always starts at the default width so server/client initial renders
   * match (same hydration-mismatch reasoning as darkMode above). The real
   * stored width, if any, is applied via afterNextRender below.
   */
  readonly analysisPanelWidth = signal(ANALYSIS_PANEL_DEFAULT_WIDTH);
  /** True only while a resize drag is in progress; drives the handle's active style. */
  readonly resizingAnalysisPanel = signal(false);

  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly themeTrigger = viewChild<ElementRef<HTMLButtonElement>>('themeTrigger');
  private readonly themeMenuTemplate = viewChild<TemplateRef<unknown>>('themeMenuTpl');
  private themeOverlayRef?: OverlayRef;
  private mediaQueryList?: MediaQueryList;
  private mediaQueryListener?: (event: MediaQueryListEvent) => void;

  /**
   * Applies the real stored theme/panel-width after the first render, once
   * we're guaranteed to be running in the browser (afterNextRender never
   * runs during build-time prerendering). Runs after hydration completes,
   * so this is a normal post-hydration update rather than a value hydration
   * needs to reconcile - see the darkMode/analysisPanelWidth doc comments.
   */
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

    const storedWidth = readStoredAnalysisPanelWidth();
    if (storedWidth !== null) {
      this.analysisPanelWidth.set(clampWidth(storedWidth, ANALYSIS_PANEL_MIN_WIDTH, ANALYSIS_PANEL_MAX_WIDTH));
    }
  });

  private readonly clipboard = inject(ClipboardService);
  private undoAction: (() => void) | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private panelResizeStartX = 0;
  private panelResizeStartWidth = 0;

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  readonly isHowItWorks = signal(false);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const exampleId = params.get('example');
      if (!exampleId) return;
      const found = DIFF_EXAMPLES.find((e) => e.id === exampleId);
      if (found) {
        this.loadExample(found);
        this.router.navigate([], { replaceUrl: true, queryParams: {} });
      }
    });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .pipe(takeUntilDestroyed())
      .subscribe((e) => {
        const onHowItWorks = e.urlAfterRedirects.startsWith('/how-it-works');
        this.isHowItWorks.set(onHowItWorks);
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
    this.isHowItWorks.set(this.router.url.startsWith('/how-it-works'));

    effect(() => {
      if (this.themeMenuOpen()) this.attachThemePanel();
      else this.themeOverlayRef?.detach();
    });

    // Move focus into the theme menu once attached
    effect(() => {
      if (!this.themeMenuOpen()) return;
      const pane = this.themeOverlayRef?.overlayElement;
      if (pane) setTimeout(() => pane.querySelector<HTMLButtonElement>('button.is-active, button')?.focus());
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
    clearTimeout(this.toastTimer);
  }

  /**
   * Selecting an array (Tree/Source row click, or a Changes-by-area row)
   * also selects that same array in the Array Matching pickers - both the
   * sidebar's and the analysis panel's, since both read `selectedAnalysis`.
   * A non-array selection leaves whatever array was already open untouched.
   */
  private readonly syncSelectedArrayAnalysis = effect(() => {
    const id = this.selectedNodeId();
    const root = this.result()?.root;
    if (!id || !root) return;
    const node = findNodeById(root, id);
    if (node?.nodeKind === 'array' && node.arrayMatch) this.selectedAnalysis.set(node.arrayMatch);
  });

  readonly canCompare = computed(() => !!this.leftText().trim() && !!this.rightText().trim());
  /** DFS pre-order change ids: view-independent and invariant to collapse state. */
  readonly changeList = computed(() => {
    const r = this.result();
    return r ? flattenChanges(r.root) : [];
  });
  /**
   * Ids of every row belonging to the selected node's subtree (inclusive), so
   * Tree and Source can highlight a selected object/array as one cohesive
   * block instead of only the single row whose id exactly matches.
   */
  readonly selectionRange = computed(() => {
    const id = this.selectedNodeId();
    const root = this.result()?.root;
    return id && root ? subtreeIds(root, id) : new Set<string>();
  });
  /** Built once per diff result; typing re-runs a cheap substring scan over this instead of re-walking the tree. */
  private readonly searchIndex = computed(() => {
    const root = this.result()?.root;
    return root ? buildSearchIndex(root) : [];
  });
  /** Canonical node ids matching the current query, in document order. Independent of changesOnly and of change navigation. */
  readonly searchResults = computed(() => searchDiff(this.searchIndex(), this.searchQuery()));
  /** For the Tree's subtle "this row matches" indicator. */
  readonly searchResultIds = computed(() => new Set(this.searchResults()));
  private readonly currentSearchNodeId = computed(() => {
    const results = this.searchResults();
    return results.length ? results[Math.min(this.searchResultIndex(), results.length - 1)] : null;
  });
  /**
   * Every array paired with its node, so the sidebar's matching section can
   * list key fields. Arrays whose node cannot be resolved are dropped rather
   * than rendered broken.
   */
  readonly matchingContexts = computed<ArrayMatchingContext[]>(() => {
    const result = this.result();
    if (!result) return [];
    return result.arrays
      .map((analysis) => ({ analysis, node: findNodeByPath(result.root, analysis.path) }))
      .filter((context): context is ArrayMatchingContext => !!context.node);
  });
  /**
   * The array the analysis panel explains. An explicit selection (a Tree match
   * pill, or "See analysis" / "Inspect") wins; otherwise it defaults to the
   * result's own preferred pick.
   */
  readonly displayedAnalysis = computed(() => this.selectedAnalysis() ?? this.result()?.primaryAnalysis ?? null);

  compare(): void {
    const leftText = formatJson(this.leftText());
    const rightText = formatJson(this.rightText());
    this.leftText.set(leftText);
    this.rightText.set(rightText);
    const left = this.parse(leftText, this.leftError);
    const right = this.parse(rightText, this.rightError);
    if (left === undefined || right === undefined) return;
    const firstCompare = !this.result();
    try {
      this.result.set(diffJson(left, right, this.options()));
    } catch (error) {
      this.showToast(`Comparison failed: ${error instanceof Error ? error.message : String(error)}. Try simplifying the input.`, 'error');
    }
    this.dirty.set(false);
    // Entering compact mode shrinks both editors; later recompares keep the user's size.
    if (firstCompare) this.editorHeight.set(EDITOR_HEIGHT_COMPACT);
    // The hero unmounts via its own `animate.leave` sink animation; no manual scroll is
    // needed since results render in the middle column's own scroll region, already in
    // view rather than below a page fold.
  }

  selectNode(nodeId: string): void {
    this.selectedNodeId.set(nodeId);
  }

  stepChange(delta: 1 | -1): void {
    this.selectedNodeId.set(stepChange(this.changeList(), this.selectedNodeId(), delta));
  }

  onSearchQueryChange(query: string): void {
    this.searchQuery.set(query);
    this.searchResultIndex.set(0);
    this.navigateToSearchResult();
  }

  stepSearchResult(delta: 1 | -1): void {
    this.searchResultIndex.update((i) => stepSearchResult(this.searchResults().length, i, delta));
    this.navigateToSearchResult();
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResultIndex.set(0);
  }

  /**
   * Selects the current search result's node, revealing it even when
   * "Changes only" would otherwise hide an unchanged match - search must work
   * regardless of that filter. Ignored nodes are never reachable here:
   * buildSearchIndex excludes them from the index entirely.
   */
  private navigateToSearchResult(): void {
    const nodeId = this.currentSearchNodeId();
    if (!nodeId) return;
    const entry = this.searchIndex().find((e) => e.nodeId === nodeId);
    if (this.changesOnly() && entry && !entry.hasChanges) this.changesOnly.set(false);
    this.selectedNodeId.set(nodeId);
  }

  patchOption<K extends keyof DiffOptions>(key: K, value: DiffOptions[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
    if (this.result()) this.recompareSilently();
  }

  addIgnore(rule: string): void {
    const trimmed = rule.trim();
    if (!trimmed || this.options().ignorePaths.includes(trimmed)) return;
    this.options.update((o) => ({ ...o, ignorePaths: [...o.ignorePaths, trimmed] }));
    this.recompareSilently();
  }

  removeIgnore(rule: string): void {
    this.options.update((o) => ({ ...o, ignorePaths: o.ignorePaths.filter((r) => r !== rule) }));
    this.recompareSilently();
  }

  /**
   * Loads a built-in example: populates both editors, applies the example's
   * comparison settings, and compares.
   *
   * The options signal is REPLACED rather than patched, so an example always
   * demonstrates itself under known settings; any ignore rules or normalization
   * toggles the user had set are reset to the defaults plus the example's own.
   * Setting the signal directly (instead of `patchOption`) also avoids the
   * recompare that would otherwise fire before the new text is compared.
   */
  loadExample(example: DiffExample): void {
    this.leftText.set(formatJson(JSON.stringify(example.original)));
    this.rightText.set(formatJson(JSON.stringify(example.changed)));
    this.leftError.set(null);
    this.rightError.set(null);
    this.dirty.set(false);
    this.selectedAnalysis.set(null);
    this.selectedNodeId.set(null);
    this.options.set({ ...DEFAULT_DIFF_OPTIONS, ...example.options });
    setTimeout(() => this.compare());
  }

  navigateToDiff(): void {
    this.router.navigateByUrl('/');
  }

  onRouteActivate(componentRef: unknown): void {
    const component = componentRef as {
      exampleRequested?: { subscribe: (fn: (example: DiffExample) => void) => void };
    };
    component.exampleRequested?.subscribe((example: DiffExample) => {
      this.loadExample(example);
      this.navigateToDiff();
    });
  }

  onBrandClick(event: MouseEvent): void {
    if (this.isHowItWorks()) {
      event.preventDefault();
      this.navigateToDiff();
    } else {
      event.preventDefault();
      this.reset();
    }
  }

  reset(): void {
    if (this.hasUnsavedState()) {
      if (typeof window !== 'undefined' && !window.confirm('Reset application? Any entered JSON and comparison results will be cleared.')) {
        return;
      }
    }
    this.leftText.set('');
    this.rightText.set('');
    this.leftError.set(null);
    this.rightError.set(null);
    this.result.set(null);
    this.dirty.set(false);
    this.selectedNodeId.set(null);
    this.view.set('source');
    this.selectedAnalysis.set(null);
    this.editorHeight.set(EDITOR_HEIGHT_DEFAULT);
  }

  private hasUnsavedState(): boolean {
    return Boolean(this.leftText().trim() || this.rightText().trim() || this.result());
  }

  markDirty(): void {
    if (this.result()) this.dirty.set(true);
  }

  /**
   * Right-panel resize drag. Uses pointer capture rather than document-level
   * listeners: once the handle captures the pointer, it keeps receiving
   * pointermove/pointerup even after the cursor leaves its thin hit box, so a
   * fast drag never "drops" the panel.
   */
  startPanelResize(event: PointerEvent): void {
    event.preventDefault();
    this.panelResizeStartX = event.clientX;
    this.panelResizeStartWidth = this.analysisPanelWidth();
    this.resizingAnalysisPanel.set(true);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPanelResizeMove(event: PointerEvent): void {
    if (!this.resizingAnalysisPanel()) return;
    // The handle sits on the panel's LEFT edge: dragging it left (negative
    // delta) widens the panel, dragging it right narrows it.
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

  /** Reads the new state off a checkbox change event. */
  isChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  inputStatus(text: string, error: string | null): string {
    if (error) return 'Invalid JSON';
    if (!text.trim()) return '';
    try {
      const parsed = JSON.parse(text) as JsonValue;
      if (Array.isArray(parsed)) return `Valid · ${parsed.length} records`;
      if (parsed && typeof parsed === 'object') return `Valid · ${Object.keys(parsed).length} top-level keys`;
      return 'Valid JSON';
    } catch {
      return 'Ready to validate';
    }
  }

  /** Fired by the Tree's match pill: selects that array in the (always-visible) analysis panel. */
  openAnalysis(path: string): void {
    const analysis = this.result()?.arrays.find((a) => a.path === path) ?? null;
    this.selectedAnalysis.set(analysis);
  }

  /** Runs a Tree/Source context-menu action (§§4-8). */
  handleNodeAction(event: NodeActionEvent): void {
    const { action, node, target } = event;
    switch (action) {
      case 'copy-path':
        return this.copy(formatSemanticPath(node), 'Copied semantic path');
      case 'copy-old-value':
        return this.copy(formatOldValue(node), 'Copied old value');
      case 'copy-new-value':
        return this.copy(formatNewValue(node), 'Copied new value');
      case 'copy-subtree':
        return this.copy(formatSubtree(node, 'right'), 'Copied subtree');
      case 'copy-change':
        return this.copy(formatChange(node), 'Copied change');
      case 'ignore-path':
        return this.applyIgnore(ignoreThisPathRule(node));
      case 'ignore-field-everywhere':
        return this.applyIgnore(ignoreFieldEverywhereRule(node));
      case 'use-as-key':
      case 'add-to-key':
        if (!target) return;
        this.applyMatchingOverride(
          { pattern: target.pattern, override: matchingKeyOverride(target, action) },
          `Matching by ${matchingKeyOverride(target, action).fields?.join(' + ')}`
        );
        return;
    }
  }

  /**
   * Writes an array-matching override into the options map and recomputes.
   *
   * A `null` override deletes the entry, which is how "Reset to Auto" returns the
   * array to inference. Every other option is preserved, and an explicit selection
   * in the analysis panel is re-pointed at the freshly computed analysis for the
   * same path.
   */
  applyMatchingOverride(change: MatchingOverrideChange, message?: string): void {
    const openPath = this.selectedAnalysis()?.path;
    this.options.update((current) => applyOverrideToOptions(current, change.pattern, change.override));
    this.recompareSilently();
    if (openPath) this.selectedAnalysis.set(this.result()?.arrays.find((a) => a.path === openPath) ?? null);
    this.showToast(message ?? (change.override ? 'Array matching updated' : 'Matching reset to Auto'));
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
    this.undoAction = null;
  }

  runUndo(): void {
    const undo = this.undoAction;
    this.dismissToast();
    undo?.();
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

  private copy(text: string, successMessage: string): void {
    if (!text) return this.showToast('Nothing to copy', 'error');
    const copied = this.clipboard.copy(text);
    this.showToast(copied ? successMessage : 'Could not access the clipboard', copied ? 'info' : 'error');
  }

  private applyIgnore(rule: string): void {
    if (this.options().ignorePaths.includes(rule)) return this.showToast(`Already ignoring ${rule}`);
    this.addIgnore(rule);
    this.showToast(`Ignored ${rule}`, 'info', 'Undo', () => this.removeIgnore(rule));
  }

  private showToast(text: string, tone: 'info' | 'error' = 'info', undoLabel?: string, undo?: () => void): void {
    clearTimeout(this.toastTimer);
    this.undoAction = undo ?? null;
    this.toast.set(createToast(text, tone, undoLabel));
    this.toastTimer = setTimeout(() => this.dismissToast(), undoLabel ? TOAST_UNDO_MS : TOAST_MS);
  }

  private recompareSilently(): void {
    const left = this.safeParse(this.leftText());
    const right = this.safeParse(this.rightText());
    if (left !== undefined && right !== undefined) {
      try {
        this.result.set(diffJson(left, right, this.options()));
      } catch (error) {
        this.showToast(`Comparison failed: ${error instanceof Error ? error.message : String(error)}. Try simplifying the input.`, 'error');
      }
    }
  }

  private parse(text: string, errorSignal: { set(value: string | null): void }): JsonValue | undefined {
    try {
      const parsed = JSON.parse(text) as JsonValue;
      errorSignal.set(null);
      return parsed;
    } catch (error) {
      errorSignal.set(error instanceof Error ? error.message : 'Invalid JSON');
      return undefined;
    }
  }

  private safeParse(text: string): JsonValue | undefined {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return undefined;
    }
  }
}
