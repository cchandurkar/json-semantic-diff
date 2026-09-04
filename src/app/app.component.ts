import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonInputComponent } from './components/json-input/json-input.component';
import { DiffTreeComponent } from './components/diff-tree/diff-tree.component';
import { AnalysisDrawerComponent } from './components/analysis-drawer/analysis-drawer.component';
import { SourceDiffComponent } from './components/source-diff/source-diff.component';
import { DEFAULT_DIFF_OPTIONS, diffJson } from './core/diff';
import { formatJson } from './core/json/format';
import { ArrayMatchAnalysis, DiffOptions, DiffResult, JsonValue } from './core/models/diff.models';
import { displayPath } from './shared/format';
import { stepChange } from './shared/node-navigation';
import { flattenChanges } from './source';

const EXAMPLE_LEFT = `{
  "users": [
    {"userId": 101, "name": "Alice", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"},
    {"userId": 102, "name": "Bob", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"},
    {"userId": 103, "name": "Cara", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"}
  ],
  "metadata": {"requestId": "req-old", "region": "us-east-1"}
}`;

const EXAMPLE_RIGHT = `{
  "users": [
    {"userId": 103, "name": "Cara", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"},
    {"userId": 101, "name": "Alice", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"},
    {"userId": 102, "name": "Bob", "status": "inactive", "updatedAt": "2026-09-04T10:00:00-04:00", "plan": "premium"},
    {"userId": 104, "name": "Diego", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"}
  ],
  "metadata": {"requestId": "req-new", "region": "us-east-1"}
}`;

const EDITOR_HEIGHT_DEFAULT = 260;
const EDITOR_HEIGHT_COMPACT = 170;
/** Must match the `sink` animation duration on `.hero-leave` in app.component.css. */
const HERO_EXIT_MS = 340;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, JsonInputComponent, DiffTreeComponent, SourceDiffComponent, AnalysisDrawerComponent],
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
  readonly inputsCollapsed = signal(false);
  readonly dirty = signal(false);
  readonly ignoreOpen = signal(false);
  readonly selectedAnalysis = signal<ArrayMatchAnalysis | null>(null);
  readonly darkMode = signal(false);
  readonly editorHeight = signal(EDITOR_HEIGHT_DEFAULT);
  readonly options = signal<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });
  /** Pure render filter: never round-trips through the engine. */
  readonly changesOnly = signal(true);
  /** Tree and Source are two renderers over one result; switching never recomputes the diff. */
  readonly view = signal<'tree' | 'source'>('tree');
  /** Single selection shared by both views, keyed on the canonical DiffNode.id. */
  readonly selectedNodeId = signal<string | null>(null);

  readonly canCompare = computed(() => !!this.leftText().trim() && !!this.rightText().trim());
  /** DFS pre-order change ids: view-independent and invariant to collapse state. */
  readonly changeList = computed(() => { const r = this.result(); return r ? flattenChanges(r.root) : []; });
  readonly autoMatchedCount = computed(() => this.result()?.autoMatchedCount ?? 0);
  readonly uncertainCount = computed(() => this.result()?.uncertainCount ?? 0);

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
    if (window.innerWidth < 1000) this.inputsCollapsed.set(true);
    // On the first compare the hero is still collapsing; scrolling now would jump down and
    // then snap back as the document shrinks, so wait for the exit animation to finish.
    setTimeout(
      () => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      firstCompare ? HERO_EXIT_MS : 0
    );
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

  loadExample(): void {
    this.leftText.set(EXAMPLE_LEFT);
    this.rightText.set(EXAMPLE_RIGHT);
    this.leftError.set(null);
    this.rightError.set(null);
    this.dirty.set(false);
    this.inputsCollapsed.set(false);
    setTimeout(() => this.compare());
  }

  reset(): void {
    this.leftText.set(''); this.rightText.set('');
    this.leftError.set(null); this.rightError.set(null);
    this.result.set(null); this.dirty.set(false); this.inputsCollapsed.set(false);
    this.selectedNodeId.set(null); this.view.set('tree');
    this.selectedAnalysis.set(null); this.ignoreOpen.set(false);
    this.editorHeight.set(EDITOR_HEIGHT_DEFAULT);
  }

  markDirty(): void { if (this.result()) this.dirty.set(true); }

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

  matchingInsight(): string {
    const matches = this.result()?.arrays.filter(a => a.outcome === 'identity-applied').slice(0, 2) ?? [];
    return matches.map(a => `${displayPath(a.path)} by ${a.keyPaths?.join(' + ')}`).join(' · ');
  }

  openAnalysis(path: string): void {
    const analysis = this.result()?.arrays.find(a => a.path === path) ?? null;
    this.selectedAnalysis.set(analysis);
  }

  openFirstAnalysis(): void {
    this.selectedAnalysis.set(this.result()?.primaryAnalysis ?? null);
  }

  toggleTheme(): void {
    this.darkMode.update(v => !v);
    document.documentElement.dataset['theme'] = this.darkMode() ? 'dark' : 'light';
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
