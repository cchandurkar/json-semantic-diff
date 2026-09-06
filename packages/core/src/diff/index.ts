/**
 * Public API of the framework-independent diff core.
 *
 * Consumers (the Angular app today, other renderers later) should import only
 * from here rather than reaching into individual modules.
 */
export { diffJson } from './diff-engine.js';
export { DEFAULT_DIFF_OPTIONS } from './options.js';
export { inferIdentity, readPath, evaluateKey, eligibleKeyPaths } from './matching/identity-inference.js';
export { matchArrays, selectArrayStrategy, resolveOverride, pairByIdentity, pairByPosition } from './matching/matching.js';
export type { ArrayMatchResult, MatchedPair } from './matching/matching.js';
export { normalize, looksLikeTimestamp } from './normalization/normalization.js';
export { shouldIgnore, matchesPathPattern } from './ignore/ignore-rules.js';
export { ROOT_SEGMENT, keySegment, indexSegment, identitySegment, appendPath, appendId, segmentLabel, stableValue } from './path.js';
export type { PathSegment } from './path.js';
export type {
  ArrayMatchAnalysis,
  ArrayMatchOutcome,
  ArrayMatchOverride,
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
} from '../models/diff.models.js';
