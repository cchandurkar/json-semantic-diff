export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * How a node's value changed between the two documents.
 * `type-changed` is distinct from `modified`: the JSON type itself differs.
 */
export type DiffChangeKind = 'unchanged' | 'added' | 'removed' | 'modified' | 'type-changed';

/** Structural shape of a node, independent of whether it changed. */
export type DiffNodeKind = 'object' | 'array' | 'scalar';

/**
 * Why an array ended up with the matching it did. Disjoint by construction:
 * `autoApply === (confidence === 'high' && !ambiguous)`, and an ambiguous
 * inference can never be high-confidence.
 */
export type ArrayMatchOutcome =
  /** Identity inference succeeded and was applied. */
  | 'identity-applied'
  /** Two or more candidates scored equally well, so none could be trusted. */
  | 'ambiguous'
  /** A best candidate existed but did not clear the confidence bar. */
  | 'below-threshold'
  /** Inference ran but found no usable candidate key. */
  | 'no-candidates'
  /** Inference never ran: scalar, empty, or non-object array. */
  | 'positional'
  /** The user pinned an explicit key, overriding whatever inference suggested. */
  | 'manual-key'
  /** The user pinned physical positions, overriding whatever inference suggested. */
  | 'manual-position';

/**
 * A user-supplied matching decision for one array, keyed in
 * `DiffOptions.arrayMatching` by the array path PATTERN it applies to.
 */
export interface ArrayMatchOverride {
  strategy: 'auto' | 'key' | 'position';
  /** Required for 'key'. Element-relative dotted paths, e.g. ["store","sku"] or ["location.store"]. */
  fields?: string[];
}

export interface ScoreBreakdownTerm {
  label: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface CandidateStats {
  paths: string[];
  uniquenessA: number;
  uniquenessB: number;
  completenessA: number;
  completenessB: number;
  /** Mean of `completenessA` and `completenessB`; precomputed so renderers never re-derive it. */
  completeness: number;
  overlap: number;
  matchCoverage: number;
  typeConsistency: number;
  nameHint: number;
  volatilityPenalty: number;
  score: number;
  scoreBreakdown?: ScoreBreakdownTerm[];
}

export interface IdentityInference {
  best?: CandidateStats;
  alternatives: CandidateStats[];
  confidence: 'high' | 'medium' | 'low';
  autoApply: boolean;
  ambiguous: boolean;
  margin?: number;
}

export interface ArrayMatchAnalysis {
  path: string;
  leftCount: number;
  rightCount: number;
  /**
   * The pairing mechanism actually used. Only these two occur: identity
   * inference either applied or it did not. Composite-vs-single key is
   * derivable from `keyPaths.length`.
   */
  strategy: 'identity' | 'position';
  outcome: ArrayMatchOutcome;
  /** Promoted from `inference.confidence`; `'low'` when no inference ran. */
  confidence: 'high' | 'medium' | 'low';
  /** True when identity matching paired at least one element across differing positions. */
  reordered: boolean;
  keyPaths?: string[];
  inference?: IdentityInference;
  /**
   * Present only when a user override decided the strategy. `strategy` stays the
   * pairing MECHANISM; provenance lives here and in `outcome`.
   */
  override?: { strategy: 'key' | 'position'; fields?: string[]; pattern: string };
  /** Stats for the fields ACTUALLY used to pair, whether inferred or pinned. */
  keyStats?: CandidateStats;
  /** Buckets holding more than one record on some side; 0 means a clean key. */
  duplicateKeyCount?: number;
}

export interface DiffNode {
  /**
   * Human-facing JSON path. Identity-matched array elements render value-only,
   * e.g. `$.users[102]`.
   */
  path: string;
  /**
   * Stable identity, safe to use as a cross-renderer key. Equal to `path` for
   * every segment except identity-matched array elements, which spell out the
   * key paths: `$.users[userId=102].status`.
   */
  id: string;
  label: string;
  nodeKind: DiffNodeKind;
  changeKind: DiffChangeKind;
  /**
   * NOTE: descendant nodes hold NORMALIZED values (timestamps rewritten to ISO,
   * numeric strings coerced) while the root holds the originals. This asymmetry
   * predates the core extraction and the Tree renders these values directly. A
   * renderer that needs the untouched input should add separate `leftRaw` /
   * `rightRaw` fields rather than change the meaning of these.
   */
  left?: JsonValue;
  right?: JsonValue;
  /**
   * The PRE-normalization values, populated on value-bearing leaves only.
   *
   * `left`/`right` above are normalized and drive comparison and the Tree. A
   * renderer that must show exactly what the user typed — the Source view's
   * ORIGINAL / CHANGED panes — reads `leftRaw ?? left`. Absent on containers,
   * whose leaves carry the raw values instead.
   */
  leftRaw?: JsonValue;
  rightRaw?: JsonValue;
  children?: DiffNode[];
  /** True when this node or any descendant has `changeKind !== 'unchanged'`. */
  hasChanges: boolean;
  /** True when an ignore rule matched this path. Such nodes stay `'unchanged'`. */
  ignored?: boolean;
  /** Original position in the left/right array, for array element nodes only. */
  leftIndex?: number;
  rightIndex?: number;
  arrayMatch?: ArrayMatchAnalysis;
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  typeChanged: number;
  unchanged: number;
  totalChanges: number;
}

export interface DiffOptions {
  ignorePaths: string[];
  numericStringsAsNumbers: boolean;
  normalizeTimestamps: boolean;
  /**
   * When true, a value that is `null` on one side and MISSING (the key/element
   * absent) on the other side compares as unchanged instead of added/removed.
   */
  nullEqualsMissing: boolean;
  /**
   * User overrides keyed by array path PATTERN (same glob syntax as
   * `ignorePaths`, e.g. `$.users[*].tags`). Exact keys win over patterns.
   */
  arrayMatching?: Record<string, ArrayMatchOverride>;
}

export interface DiffResult {
  root: DiffNode;
  summary: DiffSummary;
  arrays: ArrayMatchAnalysis[];
  /** Arrays where identity matching was applied. */
  autoMatchedCount: number;
  /** Arrays where inference ran but was not trusted. */
  uncertainCount: number;
  /** The array a UI should surface first when the user asks for "the" analysis. */
  primaryAnalysis?: ArrayMatchAnalysis;
  elapsedMs: number;
}

/**
 * EXTENSION POINT — source spans.
 *
 * A future Source renderer needs character/line offsets per node, which
 * `JSON.parse` discards. Adding them means parsing with a position-preserving
 * parser and attaching an optional span to `DiffNode` (e.g.
 * `leftSpan?: { start: number; end: number }`). Nothing in the current model
 * needs to change to accommodate that.
 */
