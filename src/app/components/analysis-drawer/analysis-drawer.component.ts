import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ArrayMatchAnalysis, CandidateStats } from '../../core/models/diff.models';
import { percent } from '../../shared/format';

/**
 * Read-only explanation of how one array was matched.
 *
 * Display only: it reports what the core decided and why. The controls that
 * CHANGE the decision live in the settings dropdown, so this drawer never
 * mutates comparison options.
 */
@Component({
  selector: 'app-analysis-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-drawer.component.html',
  styleUrl: './analysis-drawer.component.css'
})
export class AnalysisDrawerComponent {
  readonly analysis = input<ArrayMatchAnalysis | null>(null);
  readonly closed = output<void>();

  /** Heading for the selected-key section, branching on provenance not mechanism. */
  selectionLabel(): string {
    switch (this.analysis()?.outcome) {
      case 'manual-key': return 'MANUAL OVERRIDE';
      case 'manual-position': return 'MANUAL · POSITION';
      case 'identity-applied': return 'SELECTED';
      default: return 'TOP CANDIDATE';
    }
  }

  /** Mean uniqueness across both sides, the figure the duplicate-key notice shows. */
  meanUniqueness(stats: CandidateStats): number {
    return (stats.uniquenessA + stats.uniquenessB) / 2;
  }

  metrics(best: CandidateStats): { label: string; value: number }[] {
    return [
      { label: 'Uniqueness · original', value: best.uniquenessA },
      { label: 'Uniqueness · changed', value: best.uniquenessB },
      { label: 'Completeness', value: best.completeness },
      { label: 'Cross-input match coverage', value: best.matchCoverage },
      { label: 'Value overlap', value: best.overlap },
      { label: 'Type consistency', value: best.typeConsistency },
      { label: 'Field-name hint', value: best.nameHint }
    ];
  }

  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;
}
