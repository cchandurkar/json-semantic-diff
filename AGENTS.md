# AGENTS.md — JSON Semantic Diff

## Product intent

JSON Semantic Diff is a local-first JSON comparison utility. Its defining behavior is to explain meaningful structural/value changes while matching reordered object arrays by inferred row identity when evidence is strong enough.

## Non-negotiable product principles

- JSON content must remain in the browser. Do not add network calls that upload, persist, log, or analyze user JSON.
- Identity inference must remain deterministic and explainable. Do not add ML/AI models to the diff path.
- Never silently guess an identity when confidence is low or candidate scores are ambiguous. Fall back to position and expose the analysis.
- Keep the primary workflow one-page: paste/drop two JSON documents, compare, inspect results.
- Avoid IDE-like chrome. No permanent console or settings sidebar for V1.
- Advanced detail should be progressive: inline match badges -> analysis drawer.
- Preserve responsive desktop-first behavior; JSON comparison is optimized for laptop/desktop widths.

## Repo layout

This is an npm-workspaces monorepo:

- `packages/core` — the framework-free diff engine. Published to npm as `json-semantic-diff`. Must not import Angular, RxJS, or DOM APIs. Testable and buildable standalone (`npm run build`/`npm test` from within `packages/core`).
- `packages/ui` — the Angular app. Consumes `packages/core` via the npm workspaces symlink (`"json-semantic-diff": "*"`) and, for local dev/CI builds, via a `paths` alias in `packages/ui/tsconfig.json` that resolves straight from `packages/core/src` — no build-ordering step is required to develop the app.

This alias causes `ng build`/`ng test` to print `File '...' not found in TypeScript compilation.` warnings for every `packages/core/src` file pulled in transitively (and for a handful of `packages/ui/src` files reached only via a `.spec.ts` import). This is expected, upstream Angular CLI behavior for `paths`-aliasing a sibling workspace package's raw source (confirmed via `angular/angular-cli#27176` — Angular's esbuild builder does not treat it the way plain `tsc` `include` would, and widening `tsconfig.app.json`/`tsconfig.spec.json`'s `include` does not suppress it). It is **not** a bug and does not need fixing: `packages/core` is still fully type-checked independently by its own `tsc`/Vitest run, which the root `npm run build`/`npm test` scripts always run first. Don't "fix" this by touching `include`/`exclude` in `packages/ui`'s tsconfigs — it won't work, and isn't the supported path anyway (the supported fix would be dropping the `paths` alias and consuming `packages/core`'s built `dist/` output through plain npm workspace resolution instead, which reintroduces the build-ordering step this alias exists to avoid).

## Runtime and framework

- Angular: 22.x
- Node: >=24.15.0 <25
- TypeScript: 6.0.x
- UI primitives: Angular CDK where interaction primitives are required.
- Styling: Tailwind CSS 4 plus application CSS variables/components. Do not introduce a second full visual component system without a clear need.
- State: Angular signals. Prefer local/component state over global stores until cross-feature state actually warrants one.

## Architecture

- `packages/core/src/index.ts` — public API of the diff core (the npm package's entry point). Consumers import from here, not from the modules below.
- `packages/core/src/diff/index.ts` — re-exported by the package entry point; internal barrel for the diff engine's own modules.
- `packages/core/src/diff/diff-engine.ts` — recursive structural diff and diff node generation.
- `packages/core/src/diff/options.ts` — `DiffOptions` and `DEFAULT_DIFF_OPTIONS`.
- `packages/core/src/diff/path.ts` — path segment model plus the `path` and stable `id` serializers.
- `packages/core/src/diff/matching/identity-inference.ts` — deterministic candidate discovery and scoring.
- `packages/core/src/diff/matching/matching.ts` — array strategy selection, element pairing, reorder detection.
- `packages/core/src/diff/normalization/normalization.ts` — timestamp and numeric-string normalization.
- `packages/core/src/diff/ignore/ignore-rules.ts` — ignore-rule wildcard evaluation.
- `packages/core/src/models/diff.models.ts` — shared domain models (canonical diff result).
- `packages/ui/src/app/source/index.ts` — public API of the Source presentation layer (framework-free, but app-side: consumes `DiffResult` from `json-semantic-diff`).
- `packages/ui/src/app/source/source-emitter.ts` — turns a `DiffResult` into side-by-side source rows; re-runs no diff logic.
- `packages/ui/src/app/source/source-segments.ts` — changes-only segmentation with lazy collapsed regions.
- `packages/ui/src/app/examples/diff-examples.ts` — built-in demo payloads (pure JSON + optional `DiffOptions`).
- `packages/ui/src/app/shared/format.ts` — presentation-only formatting helpers shared by components.
- `packages/ui/src/app/shared/format-json.ts` — pretty-print helper for the raw JSON textareas (UI-only, not part of the diff engine's contract).
- `packages/ui/src/app/shared/node-navigation.ts` — pure ancestor/lookup/prev-next helpers keyed on `DiffNode.id`.
- `packages/ui/src/app/components/json-input/` — JSON paste/drop/open surface.
- `packages/ui/src/app/components/diff-tree/` — primary tree result renderer.
- `packages/ui/src/app/components/source-diff/` — side-by-side Source renderer; `source-view-model.ts` holds its pure logic.
- `packages/ui/src/app/components/example-picker/` — dropdown for loading the built-in examples.
- `packages/ui/src/app/components/analysis-panel/` — explainability surface for identity inference.
- `packages/ui/src/app/app.component.*` — page composition and comparison-level state.

Keep diff/domain logic framework-independent. It should be testable without Angular.
`packages/core` must not import Angular, RxJS, or DOM APIs; `packages/ui` components are
renderers over the canonical `DiffResult` and must not re-derive matching or change semantics.

## Releasing

`packages/core` (published to npm) and `packages/ui` (deployed to GitHub Pages) are
versioned and released independently, via `npm run release:core -- <patch|minor|major>` /
`npm run release:ui -- <patch|minor|major>` (`scripts/release.mjs`; full process documented
in `CONTRIBUTING.md`'s "Releasing" section). **Never create a `core-v*`/`ui-v*` tag or
GitHub Release by hand** — it bypasses the version bump, leaving `package.json` out of sync
with what the tag claims (this has happened before and caused real confusion).

## Identity inference rules

Candidate scoring is based primarily on observed data, not field-name semantics.

Current score dimensions:

- uniqueness on each input
- completeness on each input
- cross-input match coverage
- value-set overlap
- type consistency
- weak field-name hint
- volatility penalty
- composite-key complexity penalty

Single scalar paths are tested first. If no single candidate is strong enough, viable pairs may be tested as composite keys. Keep combinatorics bounded.

The algorithm must distinguish:

1. candidate quality — how identity-like a field/composite is; and
2. selection confidence — whether the best candidate is clearly better than alternatives.

A high-quality but ambiguous candidate must not be auto-applied.

## Diff semantics

- Objects compare by property name.
- Scalar arrays and uncertain object arrays fall back to position in V1.
- Object arrays may match by inferred single/composite keys only when `autoApply` is true.
- Ignore rules are local comparison settings and trigger recomparison.
- Timestamp and numeric-string normalization are explicit user options; do not silently coerce values.
- Add normalization behavior only behind explicit options.

## UX conventions

- Initial page is product + input surface, not a marketing gate.
- Inputs remain on the same page and become collapsible after comparison.
- Diff summary appears before the tree.
- Common controls live in the sticky diff toolbar.
- Matching strategy appears on the relevant array row.
- Explain scores in the analysis drawer using plain-language metrics.
- Error messages should be actionable and close to the input that caused them.
- Prefer subtle motion (<250ms) and avoid distracting transitions.

## Code style

- Use standalone Angular components.
- Use `ChangeDetectionStrategy.OnPush`.
- Prefer `input()`, `output()`, `signal()`, and `computed()` APIs.
- Keep functions small and deterministic in core diff modules.
- Use strict TypeScript and avoid `any`; template-only `$any()` is acceptable for raw DOM event extraction when needed.
- Add comments only for non-obvious algorithmic decisions, not for self-explanatory code.

## Testing expectations

Before merging changes to diff logic, cover at minimum:

- reordered arrays with stable IDs
- arbitrary/random field names with stable values
- ambiguous multiple-key candidates
- no cross-side identity overlap
- composite identities such as `(storeId, sku)`
- added/removed rows
- changed scalar values
- nested objects
- ignore rules
- timestamp normalization across timezone offsets
- input parse failures

## Scope discipline

V1 intentionally does not include:

- user accounts
- server-side persistence
- shareable uploaded diffs
- AI/ML matching
- fuzzy record matching
- 3-way comparison
- JSON Schema diff
- source/line diff
- saved profiles

Those can be added later without weakening local-first privacy or deterministic matching.
