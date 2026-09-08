import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, output, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  ArrayMatchAnalysis,
  DEFAULT_DIFF_OPTIONS,
  DiffResult,
  IDENTITY_CONFIDENCE_THRESHOLDS,
  IDENTITY_SCORING_WEIGHTS,
  ScoreBreakdownTerm,
  diffJson
} from 'json-semantic-diff';
import { DIFF_EXAMPLES, DiffExample } from '../examples';
import { decimalPercent, percent } from '../shared/format';

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './how-it-works.component.html',
  styleUrl: './how-it-works.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HowItWorksComponent implements OnDestroy {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  /** Named constants imported directly from core scoring engine */
  readonly weights = IDENTITY_SCORING_WEIGHTS;
  readonly thresholds = IDENTITY_CONFIDENCE_THRESHOLDS;

  /** Fired when user wants to load this live example into the main diff workspace */
  readonly exampleRequested = output<DiffExample>();

  /** Interactive demo mode: smart identity matching vs naive positional matching */
  readonly demoMode = signal<'smart' | 'position'>('smart');

  /** Compact interactive safety demo mode: normal addition (4 -> 5) vs extreme mismatch (3 -> 300) */
  readonly safetyDemoMode = signal<'normal' | 'mismatch'>('normal');

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
        'How JSON Semantic Diff identity inference works: candidate discovery, 6 scoring signals, decision gates, and why naive positional array matching breaks.'
    });
    this.metaService.updateTag({
      property: 'og:type',
      content: 'article'
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
      property: 'og:title',
      content: 'How It Works: Smart Array Matching — JSON Semantic Diff'
    });
    this.metaService.updateTag({
      property: 'og:description',
      content:
        'How JSON Semantic Diff identity inference works: candidate discovery, 6 scoring signals, decision gates, and why naive positional array matching breaks.'
    });
    this.metaService.updateTag({
      property: 'og:url',
      content: 'https://jsonsemanticdiff.dev/how-it-works'
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
      content: 'How It Works: Smart Array Matching — JSON Semantic Diff'
    });
    this.metaService.updateTag({
      name: 'twitter:description',
      content:
        'How JSON Semantic Diff identity inference works: candidate discovery, 6 scoring signals, decision gates, and why naive positional array matching breaks.'
    });
    this.metaService.updateTag({
      name: 'twitter:image',
      content: 'https://jsonsemanticdiff.dev/og-image.png'
    });

    let link: HTMLLinkElement | null = this.doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', 'https://jsonsemanticdiff.dev/how-it-works');

    let script: HTMLScriptElement | null = this.doc.querySelector('script#how-it-works-jsonld');
    if (!script) {
      script = this.doc.createElement('script');
      script.id = 'how-it-works-jsonld';
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: 'How It Works: Smart Array Matching — JSON Semantic Diff',
      description:
        'How JSON Semantic Diff identity inference works: candidate discovery, 6 scoring signals, decision gates, and why naive positional array matching breaks.',
      url: 'https://jsonsemanticdiff.dev/how-it-works',
      image: 'https://jsonsemanticdiff.dev/og-image.png',
      datePublished: '2026-09-07',
      dateModified: '2026-09-07',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': 'https://jsonsemanticdiff.dev/how-it-works'
      },
      author: {
        '@type': 'Person',
        name: 'Chaitanya Chandurkar',
        url: 'https://github.com/cchandurkar'
      },
      publisher: {
        '@type': 'Organization',
        name: 'JSON Semantic Diff',
        url: 'https://jsonsemanticdiff.dev/'
      }
    });

    // Execute the real comparison engine
    this.smartResult = diffJson(this.example.original, this.example.changed, DEFAULT_DIFF_OPTIONS);
    this.positionResult = diffJson(this.example.original, this.example.changed, {
      ...DEFAULT_DIFF_OPTIONS,
      arrayMatching: { '$.inventory': { strategy: 'position' } }
    });
  }

  ngOnDestroy(): void {
    const script = this.doc.getElementById('how-it-works-jsonld');
    if (script) {
      script.remove();
    }
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

  setSafetyDemoMode(mode: 'normal' | 'mismatch'): void {
    this.safetyDemoMode.set(mode);
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
