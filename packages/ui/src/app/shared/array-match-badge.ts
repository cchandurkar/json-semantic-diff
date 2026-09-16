import { ArrayMatchAnalysis } from 'json-semantic-diff';
import { percent } from './format';

export interface ArrayMatchBadge {
  readonly label: string;
  readonly warning: boolean;
  readonly tooltip: string;
}

/**
 * Derives the canonical array-match badge presentation across Tree, Source, and List views.
 */
export function formatArrayMatchBadge(match: ArrayMatchAnalysis | undefined): ArrayMatchBadge | undefined {
  if (!match) return undefined;

  const outcome = match.outcome;
  if (outcome === 'identity-applied' || outcome === 'manual-key') {
    const suffix = match.override ? 'Manual' : percent(match.inference?.best?.score);
    const keys = match.keyPaths?.join(' + ');
    const label = keys ? `Matched by ${keys} · ${suffix}` : `Matched by · ${suffix}`;
    return {
      label,
      warning: false,
      tooltip: `Array matched: ${label}`
    };
  }

  if (outcome === 'manual-position') {
    return {
      label: 'Position · Manual',
      warning: false,
      tooltip: 'Array matched by position (manual)'
    };
  }

  if (match.inference && match.confidence === 'low' && !match.override) {
    return {
      label: 'Matching uncertain',
      warning: true,
      tooltip: 'Array matching uncertain'
    };
  }

  return undefined;
}
