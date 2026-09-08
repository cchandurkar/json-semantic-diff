# AGENTS.md — JSON Semantic Diff

## Product intent

JSON Semantic Diff is a local-first JSON comparison utility. Its defining behavior is to explain meaningful structural/value changes while matching reordered object arrays by inferred row identity when evidence is strong enough.

## Non-negotiable product principles

- JSON content must remain in the browser. Do not add network calls that upload, persist, log, or analyze user JSON.
- Identity inference must remain deterministic and explainable. Do not add ML/AI models to the diff path.
- Never silently guess an identity when confidence is low or candidate scores are ambiguous. Fall back to position and expose the analysis.
- Keep the primary workflow one-page: paste/drop two JSON documents, compare, inspect results. `packages/ui/src/app/app.routes.ts` defines a single route (`{ path: '', component: AppComponent }`) purely because Angular's build-time prerendering is route-based and there is no router-less prerender path — this is not an invitation to add real navigation/multiple pages. Do not add a second route without deliberately revisiting this principle first.
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
- Node: pinned via `.nvmrc` (currently `v24.17.0`) — this is the single source of truth for the required Node version (all CI workflows read it via `node-version-file`). There is deliberately no `engines` field in the root `package.json` (removed; it duplicated `.nvmrc` and could drift out of sync with zero functional benefit — see git history).
- TypeScript: 6.0.x
- UI primitives: Angular CDK where interaction primitives are required.
- Styling: Tailwind CSS 4 plus application CSS variables/components. Do not introduce a second full visual component system without a clear need.
- State: Angular signals. Prefer local/component state over global stores until cross-feature state actually warrants one.

## Prerendering

`packages/ui` builds with build-time-only static prerendering (`angular.json`'s `outputMode: "static"` + `server: "src/main.server.ts"` + `@angular/ssr`'s `RenderMode.Prerender` in `app.routes.server.ts`) — no live Node server ships to production, this is purely so the deployed site's initial HTML contains real rendered content instead of an empty `<app-root>` (for crawlability/SEO). `ng build` runs this prerender pass in a Node environment with **no browser globals** (`window`/`document`/`localStorage`/`navigator` do not exist).

**Any new code that reads a browser global must guard it**, or a future `ng build`/deploy can crash or silently produce broken output:

- Prefer `afterNextRender(() => { ... })` for DOM-dependent initialization (e.g. `packages/ui/src/app/components/code-editor/code-editor.component.ts`'s CodeMirror `EditorView` construction — moved out of `ngAfterViewInit()`, which DOES run during prerendering, into `afterNextRender()`, which is guaranteed browser-only).
- Use a `typeof window === 'undefined'` / `typeof localStorage === 'undefined'` / `typeof document === 'undefined'` guard (or `isPlatformBrowser(inject(PLATFORM_ID))`) for simpler read/write helpers — see `packages/ui/src/app/shared/theme.ts` and `packages/ui/src/app/shared/resizable-panel.ts`.
- Do not assume a lifecycle hook is browser-only. `ngOnInit`/`ngAfterViewInit`/effects all run during server-side prerendering.

`packages/ui/src/app/app.routes.ts` exists solely to satisfy this (Angular's prerendering is route-based; see the one-page principle note above) — it is not an invitation to add real multi-page navigation.

## Architecture

This is a directory-level map, not a file inventory — it intentionally omits individual
filenames except where a specific file is load-bearing for a rule elsewhere in this document.
New files added inside an existing directory don't require updating this section; new
top-level directories or a change in a directory's responsibility do.

**`packages/core/src/`** — the framework-free diff engine.

- `index.ts` is the published npm package's entry point; consumers (including `packages/ui`)
  must import only from here, never reach into modules below it directly.
- `diff/` — recursive structural diff, array-matching strategy/identity-inference/reorder
  detection, timestamp/numeric-string normalization, and ignore-rule wildcard evaluation.
- `models/` — shared domain models (`DiffResult`, `DiffNode`, `DiffOptions`, etc.).

**`packages/ui/src/app/`** — the Angular app.

- `app.routes.ts` / `app.routes.server.ts` / `app.config.server.ts` / `src/main.server.ts` —
  prerendering scaffolding (see "Prerendering" above); route additions here are a routing
  decision, not incidental to prerendering.
- `components/` — one directory per UI feature (json-input, diff-tree, source-diff,
  analysis-panel, array-matching, array-picker, change-overview, example-picker, sidebar,
  search-control, toast, code-editor, etc.); each owns its own template/styles/spec.
- `source/` — framework-free Source (side-by-side) view-model layer; `index.ts` is its public
  surface. Consumes `DiffResult` only and re-runs no diff logic of its own.
- `shared/` — framework-adjacent pure/presentational utilities consumed across components
  (formatting, clipboard, tooltip, node navigation/actions, search indexing, storage helpers).
- `examples/` — built-in demo payloads (pure JSON + optional `DiffOptions`).
- `how-it-works/` — static informational page content (see the one-page principle above for
  the constraint this must stay within).
- `app.component.*` — page composition and comparison-level state.

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
