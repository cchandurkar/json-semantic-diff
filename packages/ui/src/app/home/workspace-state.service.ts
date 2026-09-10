import { ArrayMatchingContext } from '../components/array-matching/array-matching.component';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ArrayMatchAnalysis, DEFAULT_DIFF_OPTIONS, DiffNode, DiffOptions, DiffResult, JsonValue, diffJson } from 'json-semantic-diff';
import { formatJson } from '../shared/format-json';
import { DiffTaskResponse } from './diff-worker-task';
import { findNodeById, findNodeByPath, stepChange, subtreeIds } from '../shared/node-navigation';
import { buildSearchIndex, searchDiff, stepSearchResult } from '../shared/search-index';
import {
  MatchingOverrideChange,
  NodeActionEvent,
  applyOverrideToOptions,
  ignoreFieldEverywhereRule,
  ignoreThisPathRule,
  matchingIgnoreRules,
  matchingKeyOverride
} from '../shared/node-actions';
import { ClipboardService } from '../shared/clipboard/clipboard.service';
import { formatChange, formatNewValue, formatOldValue, formatSemanticPath, formatSubtree } from '../shared/clipboard/diff-clipboard';
import { ToastMessage, createToast } from '../shared/toast';
import { flattenChanges } from '../source';
import { DiffExample } from '../examples';

const EDITOR_HEIGHT_DEFAULT = 260;
const EDITOR_HEIGHT_COMPACT = 170;
const TOAST_MS = 2400;
const TOAST_UNDO_MS = 5000;

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  readonly leftText = signal('');
  readonly rightText = signal('');
  readonly leftError = signal<string | null>(null);
  readonly rightError = signal<string | null>(null);
  readonly result = signal<DiffResult | null>(null);
  readonly dirty = signal(false);
  readonly selectedAnalysis = signal<ArrayMatchAnalysis | null>(null);
  readonly editorHeight = signal(EDITOR_HEIGHT_DEFAULT);
  readonly options = signal<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });
  readonly changesOnly = signal(true);
  readonly view = signal<'tree' | 'source'>('source');
  readonly selectedNodeId = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly searchResultIndex = signal(0);
  readonly toast = signal<ToastMessage | null>(null);
  readonly comparing = signal(false);

  private readonly clipboard = inject(ClipboardService);
  private undoAction: (() => void) | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;
  // No ngOnDestroy: this service is providedIn 'root' and lives for the whole
  // SPA session, so there's no natural destruction point to terminate this
  // from - the terminate-on-next-call in getWorker() is the actual cleanup path.
  private worker: Worker | null = null;
  private nextRequestId = 0;

  private readonly syncSelectedArrayAnalysis = effect(() => {
    const id = this.selectedNodeId();
    const root = this.result()?.root;
    if (!id || !root) return;
    const node = findNodeById(root, id);
    if (node?.nodeKind === 'array' && node.arrayMatch) this.selectedAnalysis.set(node.arrayMatch);
  });

  readonly canCompare = computed(() => !!this.leftText().trim() && !!this.rightText().trim());
  readonly changeList = computed(() => {
    const r = this.result();
    return r ? flattenChanges(r.root) : [];
  });
  readonly selectionRange = computed(() => {
    const id = this.selectedNodeId();
    const root = this.result()?.root;
    return id && root ? subtreeIds(root, id) : new Set<string>();
  });
  private readonly searchIndex = computed(() => {
    const root = this.result()?.root;
    return root ? buildSearchIndex(root) : [];
  });
  readonly searchResults = computed(() => searchDiff(this.searchIndex(), this.searchQuery()));
  readonly searchResultIds = computed(() => new Set(this.searchResults()));
  private readonly currentSearchNodeId = computed(() => {
    const results = this.searchResults();
    return results.length ? results[Math.min(this.searchResultIndex(), results.length - 1)] : null;
  });
  readonly matchingContexts = computed<ArrayMatchingContext[]>(() => {
    const result = this.result();
    if (!result) return [];
    return result.arrays
      .map((analysis) => ({ analysis, node: findNodeByPath(result.root, analysis.path) }))
      .filter((context): context is ArrayMatchingContext => !!context.node);
  });
  readonly displayedAnalysis = computed(() => this.selectedAnalysis() ?? this.result()?.primaryAnalysis ?? null);

  readonly inputStatus = computed(() => {
    const text = this.leftText();
    const error = this.leftError();
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
  });

  compare(): void {
    this.runViaWorkerOrFallback();
  }

  /**
   * Runs the parse+format+diff pipeline in a Web Worker when available,
   * falling back to the original synchronous in-place computation otherwise
   * (SSR/prerendering per Angular's docs, or any environment without `Worker`).
   */
  private runViaWorkerOrFallback(): void {
    this.comparing.set(true);
    const worker = this.getWorker();
    if (!worker) {
      // No worker: the computation below still blocks the main thread, so we
      // still need the double rAF to let the disabled/spinner state paint first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            this.runCompare();
          } finally {
            this.comparing.set(false);
          }
        });
      });
      return;
    }

    const requestId = ++this.nextRequestId;
    const request = { requestId, leftText: this.leftText(), rightText: this.rightText(), options: this.options() };

    worker.onmessage = ({ data }: MessageEvent<DiffTaskResponse>) => {
      // getWorker() always terminates the previous worker before creating a new
      // one, so a stale response for an outdated requestId shouldn't normally
      // arrive - this check is a defensive no-op guard, not the primary
      // cancellation mechanism.
      if (data.requestId !== requestId) return;
      this.applyDiffTaskResponse(data);
      this.comparing.set(false);
    };
    worker.onerror = () => {
      this.showToast('Comparison failed: worker crashed. Try simplifying the input.', 'error');
      this.comparing.set(false);
    };
    worker.postMessage(request);
  }

  private applyDiffTaskResponse(data: DiffTaskResponse): void {
    switch (data.kind) {
      case 'success': {
        const firstCompare = !this.result();
        this.leftText.set(data.leftFormatted);
        this.rightText.set(data.rightFormatted);
        this.leftError.set(null);
        this.rightError.set(null);
        this.result.set(data.result);
        this.dirty.set(false);
        if (firstCompare) this.editorHeight.set(EDITOR_HEIGHT_COMPACT);
        return;
      }
      case 'parse-error':
        if (data.leftFormatted !== undefined) this.leftText.set(data.leftFormatted);
        if (data.rightFormatted !== undefined) this.rightText.set(data.rightFormatted);
        this.leftError.set(data.leftError ?? null);
        this.rightError.set(data.rightError ?? null);
        return;
      case 'diff-error':
        this.leftText.set(data.leftFormatted);
        this.rightText.set(data.rightFormatted);
        this.showToast(`Comparison failed: ${data.message}. Try simplifying the input.`, 'error');
        return;
    }
  }

  private getWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null; // SSR/prerender or unsupported env - caller falls back to runCompare()
    // Terminate-and-restart: a fresh call always cancels any prior in-flight
    // computation instead of letting a stale result race the latest one.
    this.worker?.terminate();
    this.worker = new Worker(new URL('./diff.worker', import.meta.url), { type: 'module' });
    return this.worker;
  }

  private runCompare(): void {
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
    if (firstCompare) this.editorHeight.set(EDITOR_HEIGHT_COMPACT);
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

  loadExample(example: DiffExample): void {
    this.leftText.set(formatJson(JSON.stringify(example.original)));
    this.rightText.set(formatJson(JSON.stringify(example.changed)));
    this.leftError.set(null);
    this.rightError.set(null);
    this.dirty.set(false);
    this.selectedAnalysis.set(null);
    this.selectedNodeId.set(null);
    this.options.set({ ...DEFAULT_DIFF_OPTIONS, ...example.options });
    // Defer to a macrotask so CodeEditorComponent's effect-driven CodeMirror update has
    // flushed the leftText/rightText signal writes above before compare() reads them.
    setTimeout(() => this.compare());
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

  openAnalysis(path: string): void {
    const analysis = this.result()?.arrays.find((a) => a.path === path) ?? null;
    this.selectedAnalysis.set(analysis);
  }

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
      case 'remove-ignore':
        return this.removeIgnoreRulesFor(node);
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

  private removeIgnoreRulesFor(node: DiffNode): void {
    const rules = matchingIgnoreRules(node, this.options().ignorePaths);
    if (!rules.length) return;
    this.options.update((o) => ({ ...o, ignorePaths: o.ignorePaths.filter((r) => !rules.includes(r)) }));
    this.recompareSilently();
    const undo = () => this.options.update((o) => ({ ...o, ignorePaths: [...o.ignorePaths, ...rules] }));
    this.showToast(rules.length === 1 ? `Stopped ignoring ${rules[0]}` : `Stopped ignoring ${rules.length} rules`, 'info', 'Undo', () => {
      undo();
      this.recompareSilently();
    });
  }

  private showToast(text: string, tone: 'info' | 'error' = 'info', undoLabel?: string, undo?: () => void): void {
    clearTimeout(this.toastTimer);
    this.undoAction = undo ?? null;
    this.toast.set(createToast(text, tone, undoLabel));
    this.toastTimer = setTimeout(() => this.dismissToast(), undoLabel ? TOAST_UNDO_MS : TOAST_MS);
  }

  private recompareSilently(): void {
    // Recomparing after an option/ignore-rule change reruns the exact same
    // worker/fallback pipeline as a manual compare - the inputs are already
    // valid JSON at this point (a result exists), so this is just a rerun.
    this.runViaWorkerOrFallback();
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
}
