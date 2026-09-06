# json-semantic-diff

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

const result = diffJson({ users: [{ userId: 1, name: 'Alice' }] }, { users: [{ userId: 1, name: 'Alicia' }] }, DEFAULT_DIFF_OPTIONS);

console.log(result.summary);
// { added: 0, removed: 0, modified: 1, typeChanged: 0, unchanged: 0, totalChanges: 1 }
```

`result.root` is a `DiffNode` tree describing the full comparison: every node carries its canonical `path`, a stable `id`, its `changeKind` (`'unchanged' | 'added' | 'removed' | 'modified' | 'type-changed'`), and - for array elements - the identity match analysis that explains _why_ two records were paired.

## What it's for

This package is the engine behind [DiffLens/JSON Semantic Diff](https://github.com/cchandurkar/json-semantic-diff), a browser-based JSON comparison tool. It's published standalone so the same deterministic diff/matching logic can be reused outside that UI - in a CLI, a test assertion helper, another editor extension, etc.

## API surface

The package's only supported entry point is its root export (`import ... from 'json-semantic-diff'`) - internal module paths are not part of the public contract and may change between minor versions.

Key exports:

- `diffJson(left, right, options)` — runs the comparison, returns a `DiffResult`.
- `DEFAULT_DIFF_OPTIONS` — sensible starting `DiffOptions`.
- `DiffNode`, `DiffResult`, `DiffOptions`, `DiffSummary`, `ArrayMatchAnalysis` and related types — the full canonical model.
- `matchArrays`, `inferIdentity` and related matching internals — exposed for advanced consumers who want to run identity inference independently of a full diff.

See the type definitions shipped with the package (or `src/diff/index.ts`) for the complete list.

## License

MIT
