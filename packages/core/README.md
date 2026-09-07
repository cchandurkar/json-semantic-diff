# JSON Semantic Diff

A framework-free JSON semantic diff engine with deterministic, explainable array identity matching.

Unlike a line-oriented text diff, `json-semantic-diff` compares two JSON documents structurally: it walks matching object keys, understands array reordering, and can infer a stable "identity" for array elements (e.g. matching `{ "userId": 101, ... }` records across two arrays even when their positions changed) so a reordered array doesn't get reported as a wall of unrelated additions and removals.

No ML/AI, no network calls, no DOM dependency - pure TypeScript, usable in Node, the browser, or any bundler.

## Install

```bash
npm install json-semantic-diff
```

## Usage

```ts
import { diffJson, DEFAULT_DIFF_OPTIONS } from 'json-semantic-diff';

const left = { users: [{ userId: 1, name: 'Alice' }] };
const right = { users: [{ userId: 1, name: 'Alicia' }] };
const result = diffJson(left, right, DEFAULT_DIFF_OPTIONS);

console.log(JSON.stringify(result, null, 2));
```

This is a trimmed view of the **real** output for the call above - only the fields that matter for understanding what happened are shown (the full shape, with every field, is documented in [`DiffResult`](#diffresult) below):

```json
{
  "root": {
    "path": "$",
    "changeKind": "modified",
    "children": [
      {
        "path": "$.users",
        "changeKind": "modified",
        "children": [
          {
            "path": "$.users[1]",
            "id": "$.users[userId=1]",
            "changeKind": "modified",
            "children": [
              { "path": "$.users[1].name", "changeKind": "modified", "left": "Alice", "right": "Alicia" },
              { "path": "$.users[1].userId", "changeKind": "unchanged", "left": 1, "right": 1 }
            ],
            "arrayMatch": {
              "strategy": "identity",
              "outcome": "identity-applied",
              "confidence": "high",
              "keyPaths": ["userId"],
              "inference": {
                "best": { "paths": ["userId"], "score": 1 },
                "alternatives": [{ "paths": ["name"], "score": 0.535 }]
              }
            }
          }
        ]
      }
    ]
  },
  "summary": { "added": 0, "removed": 0, "modified": 1, "typeChanged": 0, "unchanged": 1, "totalChanges": 1 },
  "autoMatchedCount": 1,
  "uncertainCount": 0,
  "elapsedMs": 1.4
}
```

Even for this tiny, single-field change, the engine already tells you a lot for free: it recognized `$.users` as an array of records, inferred `userId` as the identity key over the alternative `name` (score `1` vs `0.535`), and reported that with `high` confidence and no reordering. That same machinery is what lets a much larger, reordered array collapse into a handful of real per-record changes instead of a wall of positional adds/removes.

## Core concepts

- **Comparison, not line diffing.** Both documents are parsed to `JsonValue` (you pass in already-parsed objects, not JSON strings) and walked structurally, key by key and element by element.
- **`DiffNode` tree.** The result is one recursive tree (`result.root`) - one node per object key, array element, and scalar leaf. Every node carries a canonical `path`, a stable `id`, and a `changeKind`.
- **Path vs id.** `path` is the human-facing JSON path (`$.users[1]` for a positionally-paired element). `id` is safe to use as a render key across re-diffs: for identity-matched array elements it spells out the key that produced the pairing (`$.users[userId=1]`) instead of a position that can shift.
- **Normalized vs raw values.** `left`/`right` on every node hold **normalized** values (see `normalizeTimestamps`/`numericStringsAsNumbers` below) and are what comparison and `changeKind` are based on. Leaf nodes additionally carry `leftRaw`/`rightRaw` holding the untouched input, for a renderer that needs to show exactly what the user typed.
- **Array identity matching.** For an array of objects, the engine tries to infer a "natural key" (e.g. `userId`, `id`, `sku`) that uniquely and consistently identifies each record on both sides. When it's confident, elements are paired by that key instead of by position, so reordering doesn't get reported as noise. Every array's decision - and why it made that decision - is recorded in an `ArrayMatchAnalysis`, both inline on the array's `DiffNode.arrayMatch` and flattened into `result.arrays`.

## API reference

The package's only supported entry point is its root export (`import ... from 'json-semantic-diff'`) - internal module paths are not part of the public contract and may change between minor versions. Full type definitions ship with the package (`dist/index.d.ts`); this section documents the same surface in prose.

### `diffJson(left, right, options): DiffResult`

The main entry point. Compares two already-parsed JSON values and returns a `DiffResult`.

```ts
function diffJson(left: JsonValue, right: JsonValue, options: DiffOptions): DiffResult;
```

### `DEFAULT_DIFF_OPTIONS`

A ready-to-use `DiffOptions` baseline:

```ts
const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignorePaths: [],
  numericStringsAsNumbers: false,
  normalizeTimestamps: true,
  nullEqualsMissing: false
};
```

### `DiffOptions`

| Option                | Type                                    | Default        | Description                                                                                                                                                       |
| ---------------------- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ignorePaths`          | `string[]`                                | `[]`           | Glob-style path patterns (see [Ignore path syntax](#ignore-path-syntax)). Matching nodes are forced `unchanged` and marked `ignored: true` instead of being reported as changes. |
| `numericStringsAsNumbers` | `boolean`                               | `false`        | When `true`, a numeric-looking string (`"42"`) compares equal to the real number `42`.                                                                             |
| `normalizeTimestamps`  | `boolean`                                  | `true`         | When `true`, ISO-8601-looking timestamp strings are parsed and re-serialized to a canonical UTC ISO string before comparing, so `"2026-09-04T14:00:00Z"` and `"2026-09-04T10:00:00-04:00"` compare equal. |
| `nullEqualsMissing`    | `boolean`                                  | `false`        | When `true`, a key that is `null` on one side and entirely absent on the other compares as `unchanged` instead of `added`/`removed`.                                |
| `arrayMatching`        | `Record<string, ArrayMatchOverride>` \| `undefined` | `undefined`    | Per-array overrides that pin the matching strategy instead of leaving it to inference. See [Array matching overrides](#array-matching-overrides).                 |

#### Ignore path syntax

`ignorePaths` (and `arrayMatching` keys, which use the identical matcher) are glob-ish patterns matched against a node's serialized `path`:

- `*` — matches exactly one path segment; does not cross a `.` or a bracket.
- `**` — matches any number of segments.
- `[*]` — matches any array bracket body, so it matches both a positional element (`[2]`) and an identity-matched element (`[102]`).

```ts
diffJson(left, right, {
  ...DEFAULT_DIFF_OPTIONS,
  ignorePaths: [
    '$.metadata.requestId', // exact path
    '$.users[*].updatedAt', // any user's updatedAt, whichever way that user's array element paired
    '$.**.internalNotes' // internalNotes at any depth
  ]
});
```

#### Array matching overrides

By default every array of objects goes through identity inference (see [Core concepts](#core-concepts)). `arrayMatching` lets you pin the strategy for a specific array path (exact path or glob pattern, same syntax as `ignorePaths`; an exact key wins over a pattern):

```ts
interface ArrayMatchOverride {
  strategy: 'auto' | 'key' | 'position';
  /** Required for 'key'. Element-relative dotted paths, e.g. ["store", "sku"] or ["location.store"]. */
  fields?: string[];
}

diffJson(left, right, {
  ...DEFAULT_DIFF_OPTIONS,
  arrayMatching: {
    '$.users': { strategy: 'key', fields: ['userId'] }, // pin the key explicitly
    '$.logs[*].tags': { strategy: 'position' }, // force positional pairing, e.g. for volatile/unkeyable data
    '$.orders': { strategy: 'auto' } // explicit no-op, same as omitting the entry
  }
});
```

Even when a key is pinned, inference still runs in the background so `arrayMatch.inference` can show a renderer what auto-matching *would* have picked.

#### Normalize numeric strings and timestamps

`numericStringsAsNumbers` and `normalizeTimestamps` control how raw string values are canonicalized before comparison:

```ts
diffJson(
  { amount: '42', updatedAt: '2026-09-04T14:00:00Z' },
  { amount: 42, updatedAt: '2026-09-04T10:00:00-04:00' },
  {
    ...DEFAULT_DIFF_OPTIONS,
    numericStringsAsNumbers: true, // '42' vs 42 -> unchanged
    normalizeTimestamps: true // same instant, different offset -> unchanged (already the default)
  }
);
```

Both fields report `changeKind: 'unchanged'` - `left`/`right` hold the normalized values (`42` and the canonical UTC timestamp), while each leaf's `leftRaw`/`rightRaw` still holds exactly what was passed in.

#### Treat null and missing as equal

By default a key that's `null` on one side and absent on the other is reported as `added`/`removed`. Set `nullEqualsMissing` to fold that into `unchanged`:

```ts
diffJson({ nickname: null }, {}, { ...DEFAULT_DIFF_OPTIONS, nullEqualsMissing: true });
```

`nickname` now compares as `unchanged` instead of `removed` - useful when your data layer treats "explicitly null" and "key never set" as the same thing.

### `DiffResult`

```ts
interface DiffResult {
  root: DiffNode; // the full comparison tree
  summary: DiffSummary; // aggregate counts across every node
  arrays: ArrayMatchAnalysis[]; // one entry per array compared anywhere in the document
  autoMatchedCount: number; // arrays where identity matching was applied
  uncertainCount: number; // arrays where inference ran but wasn't trusted
  primaryAnalysis?: ArrayMatchAnalysis; // the array a UI should surface first, if any
  elapsedMs: number; // wall-clock time the comparison took
}
```

### `DiffNode`

```ts
interface DiffNode {
  path: string; // human-facing JSON path, e.g. "$.users[102]"
  id: string; // stable identity, safe as a cross-render key, e.g. "$.users[userId=102]"
  label: string; // short display label, e.g. "userId" or "[userId=102]"
  nodeKind: 'object' | 'array' | 'scalar';
  changeKind: 'unchanged' | 'added' | 'removed' | 'modified' | 'type-changed';
  left?: JsonValue; // normalized value (root only) / omitted where not applicable
  right?: JsonValue;
  leftRaw?: JsonValue; // pre-normalization value, leaf nodes only
  rightRaw?: JsonValue;
  children?: DiffNode[];
  hasChanges: boolean; // true if this node or any descendant changed
  ignored?: boolean; // true if an ignore rule matched this path
  leftIndex?: number; // original array position, array elements only
  rightIndex?: number;
  arrayMatch?: ArrayMatchAnalysis; // present on array-kind nodes
}
```

### `DiffSummary`

```ts
interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  typeChanged: number;
  unchanged: number;
  totalChanges: number; // added + removed + modified + typeChanged
}
```

### `ArrayMatchAnalysis`

Explains how one array was paired, and why:

```ts
interface ArrayMatchAnalysis {
  path: string;
  leftCount: number;
  rightCount: number;
  strategy: 'identity' | 'position'; // the pairing mechanism actually used
  outcome:
    | 'identity-applied' // inference succeeded and was applied
    | 'ambiguous' // two+ candidates scored equally well
    | 'below-threshold' // a best candidate existed but wasn't confident enough
    | 'no-candidates' // inference ran but found no usable key
    | 'positional' // inference never ran (scalar/empty/non-object array)
    | 'manual-key' // user pinned a key via arrayMatching
    | 'manual-position'; // user pinned position via arrayMatching
  confidence: 'high' | 'medium' | 'low';
  reordered: boolean; // true if identity pairing crossed positions
  keyPaths?: string[]; // the field(s) actually used to pair
  inference?: IdentityInference; // full inference detail, win or lose
  override?: { strategy: 'key' | 'position'; fields?: string[]; pattern: string };
  keyStats?: CandidateStats; // stats for the fields actually used to pair
  duplicateKeyCount?: number; // key buckets holding >1 record on some side
}

interface IdentityInference {
  best?: CandidateStats;
  alternatives: CandidateStats[];
  confidence: 'high' | 'medium' | 'low';
  autoApply: boolean; // true only when confidence is 'high' and not ambiguous
  ambiguous: boolean;
}

interface CandidateStats {
  paths: string[]; // the field path(s) this candidate represents
  uniquenessA: number;
  uniquenessB: number; // fraction of distinct values, each side
  completenessA: number;
  completenessB: number; // fraction of records with a value present, each side
  completeness: number; // mean of completenessA/completenessB
  overlap: number; // Jaccard overlap of the value sets between sides
  matchCoverage: number; // fraction of records that found a match on the other side
  typeConsistency: number; // how consistently-typed the field is
  nameHint: number; // heuristic score from the field's own name (id/sku/... vs status/count/...)
  volatilityPenalty: number; // penalty for fields whose name suggests they change often
  score: number; // weighted overall score used to rank candidates
}
```

### Advanced matching utilities

For consumers who want to reuse the identity-inference/matching machinery outside a full `diffJson` call (e.g. building a custom key picker UI):

- `matchArrays(left, right, path, arrayMatching?)` — runs the full strategy selection *and* pairing for one array, returning `{ analysis: ArrayMatchAnalysis, pairs: MatchedPair[] }`.
- `selectArrayStrategy(left, right, path, arrayMatching?)` — just the strategy decision (no pairing), i.e. what `matchArrays` uses internally to produce `ArrayMatchAnalysis`.
- `resolveOverride(path, arrayMatching?)` — looks up which `ArrayMatchOverride` (if any) governs a given path, exact match first, then patterns in insertion order.
- `pairByIdentity(left, right, keyPaths)` / `pairByPosition(left, right)` — the two low-level pairing strategies, each returning `MatchedPair[]`.
- `inferIdentity(left, right)` — runs identity inference standalone and returns an `IdentityInference`.
- `evaluateKey(left, right, fields)` — scores an explicit field set the same way inference scores its own candidates; returns a `CandidateStats` (or `undefined` if unusable).
- `eligibleKeyPaths(left, right)` — every scalar leaf path present in either array's objects; useful for populating a "pick a key" dropdown.
- `readPath(row, path)` — reads a dotted field path off one object, returning `undefined` if any segment is missing or not traversable.

```ts
interface MatchedPair {
  segment: PathSegment;
  left?: JsonValue;
  right?: JsonValue;
  leftIndex?: number; // undefined on the side with no record
  rightIndex?: number;
}
```

### Path utilities

Every string form of a path is derived from a small set of `PathSegment` values, exported for consumers building their own path strings or custom renderers:

- `ROOT_SEGMENT`, `keySegment(name)`, `indexSegment(index)`, `identitySegment(keyPaths, values, occurrence?)` — construct segments.
- `appendPath(parent, segment)` — builds the human-facing `path` string (identity segments render value-only: `$.users[102]`).
- `appendId(parent, segment)` — builds the stable `id` string (identity segments spell out the key: `$.users[userId=102]`).
- `segmentLabel(segment)` — the short display label used for `DiffNode.label`.
- `stableValue(value)` — deterministic string form of a single value, used as the pairing/sort key.

### Normalization utilities

- `normalize(value, options)` — recursively applies `numericStringsAsNumbers`/`normalizeTimestamps` to a `JsonValue`, returning the comparison-ready form (this is what produces `DiffNode.left`/`right`).
- `looksLikeTimestamp(value)` — cheap heuristic (`/^\d{4}-\d{2}-\d{2}T/`) used to decide whether a string is worth attempting to parse as a timestamp.

### Ignore-rule utilities

- `shouldIgnore(path, rules)` — true if any pattern in `rules` matches `path` (what powers `ignorePaths`).
- `matchesPathPattern(path, pattern)` — the single glob-ish matcher shared by `ignorePaths` and `arrayMatching`, exposed standalone. See [Ignore path syntax](#ignore-path-syntax) for the pattern grammar.

## What it's for

This package is the engine behind [DiffLens/JSON Semantic Diff](https://github.com/cchandurkar/json-semantic-diff), a browser-based JSON comparison tool. It's published standalone so the same deterministic diff/matching logic can be reused outside that UI - in a CLI, a test assertion helper, another editor extension, etc.

## License

MIT
