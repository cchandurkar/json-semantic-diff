# AGENTS.md — DiffLens

## Product intent
DiffLens is a local-first JSON comparison utility. Its defining behavior is to explain meaningful structural/value changes while matching reordered object arrays by inferred row identity when evidence is strong enough.

## Non-negotiable product principles
- JSON content must remain in the browser. Do not add network calls that upload, persist, log, or analyze user JSON.
- Identity inference must remain deterministic and explainable. Do not add ML/AI models to the diff path.
- Never silently guess an identity when confidence is low or candidate scores are ambiguous. Fall back to position and expose the analysis.
- Keep the primary workflow one-page: paste/drop two JSON documents, compare, inspect results.
- Avoid IDE-like chrome. No permanent console or settings sidebar for V1.
- Advanced detail should be progressive: inline match badges -> analysis drawer.
- Preserve responsive desktop-first behavior; JSON comparison is optimized for laptop/desktop widths.

## Runtime and framework
- Angular: 22.x
- Node: >=24.15.0 <25
- TypeScript: 6.0.x
- UI primitives: Angular CDK where interaction primitives are required.
- Styling: Tailwind CSS 4 plus application CSS variables/components. Do not introduce a second full visual component system without a clear need.
- State: Angular signals. Prefer local/component state over global stores until cross-feature state actually warrants one.

## Architecture
- `src/app/core/diff/index.ts` — public API of the diff core. Consumers import from here, not from the modules below.
- `src/app/core/diff/diff-engine.ts` — recursive structural diff and diff node generation.
- `src/app/core/diff/options.ts` — `DiffOptions` and `DEFAULT_DIFF_OPTIONS`.
- `src/app/core/diff/path.ts` — path segment model plus the `path` and stable `id` serializers.
- `src/app/core/diff/matching/identity-inference.ts` — deterministic candidate discovery and scoring.
- `src/app/core/diff/matching/matching.ts` — array strategy selection, element pairing, reorder detection.
- `src/app/core/diff/normalization/normalization.ts` — timestamp and numeric-string normalization.
- `src/app/core/diff/ignore/ignore-rules.ts` — ignore-rule wildcard evaluation.
- `src/app/core/models/diff.models.ts` — shared domain models (canonical diff result).
- `src/app/source/index.ts` — public API of the Source presentation layer (framework-free).
- `src/app/source/source-emitter.ts` — turns a `DiffResult` into side-by-side source rows; re-runs no diff logic.
- `src/app/source/source-segments.ts` — changes-only segmentation with lazy collapsed regions.
- `src/app/shared/format.ts` — presentation-only formatting helpers shared by components.
- `src/app/shared/node-navigation.ts` — pure ancestor/lookup/prev-next helpers keyed on `DiffNode.id`.
- `src/app/components/json-input/` — JSON paste/drop/open surface.
- `src/app/components/diff-tree/` — primary tree result renderer.
- `src/app/components/source-diff/` — side-by-side Source renderer; `source-view-model.ts` holds its pure logic.
- `src/app/components/analysis-drawer/` — explainability surface for identity inference.
- `src/app/app.component.*` — page composition and comparison-level state.

Keep diff/domain logic framework-independent. It should be testable without Angular.
The core must not import Angular, RxJS, or DOM APIs; components are renderers over
the canonical `DiffResult` and must not re-derive matching or change semantics.

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
