import { ArrayMatchAnalysis } from '../../core/diff';

/**
 * One-line explanation of how an array is matched, for the array-picker's hint
 * text. Reuses the same "Match by X" wording already established by
 * `matchSummary` in `source-view-model.ts` and the Tree's match pill
 * (`diff-tree.component.html`), rather than inventing new copy - this is
 * purely a shorter, hint-sized variant of the same idea.
 *
 * `identity-applied` and `manual-key` always carry `keyPaths`, so they always
 * take the first branch; the remaining outcomes never have `keyPaths` and get
 * outcome-specific fallback wording instead.
 */
export function describeArrayMatch(analysis: ArrayMatchAnalysis): string {
  if (analysis.keyPaths?.length) return `Match by ${analysis.keyPaths.join(' + ')}`;
  switch (analysis.outcome) {
    case 'manual-position': return 'Position · Manual';
    case 'ambiguous': return 'Ambiguous match — using position';
    case 'below-threshold': return 'No confident match — using position';
    case 'no-candidates': return 'No identity candidates — using position';
    default: return 'Compared by position';
  }
}
