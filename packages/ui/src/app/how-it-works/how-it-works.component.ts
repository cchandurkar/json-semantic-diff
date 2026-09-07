import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ArrayMatchAnalysis, DEFAULT_DIFF_OPTIONS, DiffResult, ScoreBreakdownTerm, diffJson } from 'json-semantic-diff';
import { DIFF_EXAMPLES, DiffExample } from '../examples';
import { decimalPercent, percent } from '../shared/format';
import { output } from '@angular/core';

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './how-it-works.component.html',
  styleUrl: './how-it-works.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HowItWorksComponent {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);

  /** Fired when user wants to load this live example into the main diff workspace */
  readonly exampleRequested = output<DiffExample>();

  /** Interactive demo mode: smart identity matching vs naive positional matching */
  readonly demoMode = signal<'smart' | 'position'>('smart');

  /** The real built-in Inventory by Store example */
  readonly example: DiffExample = DIFF_EXAMPLES.find((e) => e.id === 'inventory-by-store') ?? DIFF_EXAMPLES[0];

  /** Precomputed results using the real diffJson engine */
  readonly smartResult: DiffResult;
  readonly positionResult: DiffResult;

  constructor() {
    this.titleService.setTitle('How It Works: Smart Array Matching — JSON Semantic Diff');
    this.metaService.updateTag({
      name: 'description',
      content:
        'In-depth technical explanation of JSON Semantic Diff identity-inference algorithm: candidate discovery, 6 scoring signals, decision gates, and why naive positional matching breaks.'
    });
    this.metaService.updateTag({
      property: 'og:title',
      content: 'How It Works: Smart Array Matching — JSON Semantic Diff'
    });
    this.metaService.updateTag({
      property: 'og:description',
      content:
        'In-depth technical explanation of JSON Semantic Diff identity-inference algorithm: candidate discovery, 6 scoring signals, decision gates, and why naive positional matching breaks.'
    });
    this.metaService.updateTag({
      property: 'og:url',
      content: 'https://jsonsemanticdiff.dev/how-it-works'
    });

    // Execute the real comparison engine
    this.smartResult = diffJson(this.example.original, this.example.changed, DEFAULT_DIFF_OPTIONS);
    this.positionResult = diffJson(this.example.original, this.example.changed, {
      ...DEFAULT_DIFF_OPTIONS,
      arrayMatching: { '$.inventory': { strategy: 'position' } }
    });
  }

  get activeResult(): DiffResult {
    return this.demoMode() === 'smart' ? this.smartResult : this.positionResult;
  }

  get smartAnalysis(): ArrayMatchAnalysis | undefined {
    return this.smartResult.arrays[0];
  }

  get scoreBreakdown(): ScoreBreakdownTerm[] {
    return this.smartAnalysis?.inference?.best?.scoreBreakdown ?? [];
  }

  get bestCandidate() {
    return this.smartAnalysis?.inference?.best;
  }

  get secondCandidate() {
    return this.smartAnalysis?.inference?.alternatives[0];
  }

  get alternatives() {
    return this.smartAnalysis?.inference?.alternatives ?? [];
  }

  setDemoMode(mode: 'smart' | 'position'): void {
    this.demoMode.set(mode);
  }

  openInWorkspace(): void {
    this.exampleRequested.emit(this.example);
  }

  formatMultiplier(term: ScoreBreakdownTerm): string {
    return term.label.includes('penalty') ? String(term.value) : this.percent(term.value);
  }

  readonly percent = percent;
  readonly decimalPercent = decimalPercent;
}
