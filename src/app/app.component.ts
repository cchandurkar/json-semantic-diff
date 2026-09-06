import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { JsonInputComponent } from './components/json-input/json-input.component';
import { DiffTreeComponent } from './components/diff-tree/diff-tree.component';
import { AnalysisPanelComponent } from './components/analysis-panel/analysis-panel.component';
import { SourceDiffComponent } from './components/source-diff/source-diff.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ToastComponent } from './components/toast/toast.component';
import { ArrayMatchingContext } from './components/array-matching/array-matching.component';
import { DEFAULT_DIFF_OPTIONS, diffJson } from './core/diff';
import { formatJson } from './core/json/format';
import { ArrayMatchAnalysis, DiffOptions, DiffResult, JsonValue } from './core/models/diff.models';
import { findNodeByPath, stepChange, subtreeIds } from './shared/node-navigation';
import { MatchingOverrideChange, NodeActionEvent, applyOverrideToOptions, ignoreFieldEverywhereRule, ignoreThisPathRule, matchingKeyOverride } from './shared/node-actions';
import { ClipboardService } from './shared/clipboard/clipboard.service';
import { formatChange, formatNewValue, formatOldValue, formatSemanticPath, formatSubtree } from './shared/clipboard/diff-clipboard';
import { ToastMessage, createToast } from './shared/toast';
import { Theme, applyTheme, readStoredTheme, storeTheme } from './shared/theme';
import {
  ANALYSIS_PANEL_DEFAULT_WIDTH,
  ANALYSIS_PANEL_MAX_WIDTH,
  ANALYSIS_PANEL_MIN_WIDTH,
  clampWidth,
  readStoredAnalysisPanelWidth,
  storeAnalysisPanelWidth
} from './shared/resizable-panel';
import { flattenChanges } from './source';
import { DiffExample } from './examples';

const EDITOR_HEIGHT_DEFAULT = 260;
const EDITOR_HEIGHT_COMPACT = 170;
/** How long a toast stays up; longer when it offers an undo. */
const TOAST_MS = 2400;
const TOAST_UNDO_MS = 5000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [JsonInputComponent, DiffTreeComponent, SourceDiffComponent, SidebarComponent, AnalysisPanelComponent, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly leftText = signal('');
  readonly rightText = signal('');
  readonly leftError = signal<string | null>(null);
  readonly rightError = signal<string | null>(null);
  readonly result = signal<DiffResult | null>(null);
  readonly dirty = signal(false);
  readonly selectedAnalysis = signal<ArrayMatchAnalysis | null>(null);
  /** Seeded from storage; the inline script in index.html already applied it to the document. */
  readonly darkMode = signal(readStoredTheme() === 'dark');
  readonly editorHeight = signal(EDITOR_HEIGHT_DEFAULT);
  readonly options = signal<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });
  /** Pure render filter: never round-trips through the engine. */
  readonly changesOnly = signal(true);
  /** Tree and Source are two renderers over one result; switching never recomputes the diff. */
  readonly view = signal<'tree' | 'source'>('tree');
  /** Single selection shared by both views, keyed on the canonical DiffNode.id. */
  readonly selectedNodeId = signal<string | null>(null);
  readonly toast = signal<ToastMessage | null>(null);
  /** Seeded from storage; clamped in case the saved value predates a min/max change. */
  readonly analysisPanelWidth = signal(
    clampWidth(readStoredAnalysisPanelWidth() ?? ANALYSIS_PANEL_DEFAULT_WIDTH, ANALYSIS_PANEL_MIN_WIDTH, ANALYSIS_PANEL_MAX_WIDTH)
  );
  /** True only while a resize drag is in progress; drives the handle's active style. */
  readonly resizingAnalysisPanel = signal(false);

  private readonly clipboard = inject(ClipboardService);
  private undoAction: (() => void) | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private panelResizeStartX = 0;
  private panelResizeStartWidth = 0;

  readonly canCompare = computed(() => !!this.leftText().trim() && !!this.rightText().trim());
  /** DFS pre-order change ids: view-independent and invariant to collapse state. */
  readonly changeList = computed(() => { const r = this.result(); return r ? flattenChanges(r.root) : []; });
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
  /**
   * Every array paired with its node, so the sidebar's matching section can
   * list key fields. Arrays whose node cannot be resolved are dropped rather
   * than rendered broken.
   */
  readonly matchingContexts = computed<ArrayMatchingContext[]>(() => {
    const result = this.result();
    if (!result) return [];
    return result.arrays
      .map(analysis => ({ analysis, node: findNodeByPath(result.root, analysis.path) }))
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
    this.result.set(diffJson(left, right, this.options()));
    this.dirty.set(false);
    // Entering compact mode shrinks both editors; later recompares keep the user's size.
    if (firstCompare) this.editorHeight.set(EDITOR_HEIGHT_COMPACT);
    // The hero unmounts via its own `animate.leave` sink animation; no manual scroll is
    // needed since results render in the middle column's own scroll region, already in
    // view rather than below a page fold.
  }

  selectNode(nodeId: string): void { this.selectedNodeId.set(nodeId); }

  stepChange(delta: 1 | -1): void {
    this.selectedNodeId.set(stepChange(this.changeList(), this.selectedNodeId(), delta));
  }

  patchOption<K extends keyof DiffOptions>(key: K, value: DiffOptions[K]): void {
    this.options.update(o => ({ ...o, [key]: value }));
    if (this.result()) this.recompareSilently();
  }

  addIgnore(rule: string): void {
    const trimmed = rule.trim();
    if (!trimmed || this.options().ignorePaths.includes(trimmed)) return;
    this.options.update(o => ({ ...o, ignorePaths: [...o.ignorePaths, trimmed] }));
    this.recompareSilently();
  }

  removeIgnore(rule: string): void {
    this.options.update(o => ({ ...o, ignorePaths: o.ignorePaths.filter(r => r !== rule) }));
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

  reset(): void {
    this.leftText.set(''); this.rightText.set('');
    this.leftError.set(null); this.rightError.set(null);
    this.result.set(null); this.dirty.set(false);
    this.selectedNodeId.set(null); this.view.set('tree');
    this.selectedAnalysis.set(null);
    this.editorHeight.set(EDITOR_HEIGHT_DEFAULT);
  }

  markDirty(): void { if (this.result()) this.dirty.set(true); }

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
    const maxWidth = Math.min(ANALYSIS_PANEL_MAX_WIDTH, window.innerWidth * 0.4);
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
    if (!text.trim()) return 'Waiting for JSON';
    try {
      const parsed = JSON.parse(text) as JsonValue;
      if (Array.isArray(parsed)) return `Valid · ${parsed.length} records`;
      if (parsed && typeof parsed === 'object') return `Valid · ${Object.keys(parsed).length} top-level keys`;
      return 'Valid JSON';
    } catch { return 'Ready to validate'; }
  }

  /** Fired by the Tree's match pill: selects that array in the (always-visible) analysis panel. */
  openAnalysis(path: string): void {
    const analysis = this.result()?.arrays.find(a => a.path === path) ?? null;
    this.selectedAnalysis.set(analysis);
  }

  /** Runs a Tree/Source context-menu action (§§4-8). */
  handleNodeAction(event: NodeActionEvent): void {
    const { action, node, target } = event;
    switch (action) {
      case 'copy-path': return this.copy(formatSemanticPath(node), 'Copied DiffLens path');
      case 'copy-old-value': return this.copy(formatOldValue(node), 'Copied old value');
      case 'copy-new-value': return this.copy(formatNewValue(node), 'Copied new value');
      case 'copy-subtree': return this.copy(formatSubtree(node, 'right'), 'Copied subtree');
      case 'copy-change': return this.copy(formatChange(node), 'Copied change');
      case 'ignore-path': return this.applyIgnore(ignoreThisPathRule(node));
      case 'ignore-field-everywhere': return this.applyIgnore(ignoreFieldEverywhereRule(node));
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
    this.options.update(current => applyOverrideToOptions(current, change.pattern, change.override));
    this.recompareSilently();
    if (openPath) this.selectedAnalysis.set(this.result()?.arrays.find(a => a.path === openPath) ?? null);
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

  toggleTheme(): void {
    this.darkMode.update(v => !v);
    const theme: Theme = this.darkMode() ? 'dark' : 'light';
    applyTheme(theme);
    storeTheme(theme);
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
    if (left !== undefined && right !== undefined) this.result.set(diffJson(left, right, this.options()));
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
    try { return JSON.parse(text) as JsonValue; } catch { return undefined; }
  }
}
