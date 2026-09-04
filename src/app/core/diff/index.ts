/**
 * Public API of the framework-independent diff core.
 *
 * Consumers (the Angular app today, other renderers later) should import only
 * from here rather than reaching into individual modules.
 */
export { diffJson } from './diff-engine';
export { DEFAULT_DIFF_OPTIONS } from './options';
export { inferIdentity, readPath } from './matching/identity-inference';
export { matchArrays, selectArrayStrategy, pairByIdentity, pairByPosition } from './matching/matching';
export type { ArrayMatchResult, MatchedPair } from './matching/matching';
export { normalize, looksLikeTimestamp } from './normalization/normalization';
export { shouldIgnore } from './ignore/ignore-rules';
export {
  ROOT_SEGMENT,
  keySegment,
  indexSegment,
  identitySegment,
  appendPath,
  appendId,
  segmentLabel,
  stableValue
} from './path';
export type { PathSegment } from './path';
export type {
  ArrayMatchAnalysis,
  ArrayMatchOutcome,
  CandidateStats,
  DiffChangeKind,
  DiffNodeKind,
  DiffNode,
  DiffOptions,
  DiffResult,
  DiffSummary,
  IdentityInference,
  JsonObject,
  JsonScalar,
  JsonValue
} from '../models/diff.models';
