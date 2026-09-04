import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ArrayMatchAnalysis, CandidateStats } from '../../core/models/diff.models';
import { percent } from '../../shared/format';

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
  /** Re-exported for the template; formatting lives in shared/format.ts. */
  readonly percent = percent;
  metrics(best: CandidateStats): {label: string; value: number}[] {
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
}
