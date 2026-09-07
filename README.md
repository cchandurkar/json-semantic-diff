# JSON Semantic Diff

JSON Semantic Diff is a local-first JSON comparison app focused on meaningful differences rather than line-oriented text changes.

This repo is an npm-workspaces monorepo:

- `packages/core` — the framework-free diff engine, published to npm as [`json-semantic-diff`](https://www.npmjs.com/package/json-semantic-diff)
- `packages/ui` — the Angular app that consumes it

## V1 features

- Single-page paste/drop/open workflow
- Tree-aware JSON diff
- Added / removed / modified summary
- Smart object-array row matching
- Deterministic identity scoring (no ML/AI)
- Single and two-field composite identity candidates
- Confidence/ambiguity guardrails before auto-matching
- Matching analysis drawer with score breakdown
- Changes-only filter
- Timestamp normalization
- Numeric-string normalization
- Ignore-path rules with wildcards
- Collapsible inputs after comparison
- Dark theme
- Entire comparison runs in the browser

## Stack

- Angular 22
- Node 24
- TypeScript 6
- Angular CDK
- Tailwind CSS 4 + CSS variables

Angular 22.0 requires Node `^24.15.0` when using the Node 24 line, so use Node 24.15+.

## Run locally

```bash
npm install
npm run start --workspace=packages/ui
```

Open `http://localhost:4200`.

Production build:

```bash
npm run build --workspace=packages/ui
```

## Try the differentiator

Click **Example**. The `users` array is deliberately reordered between inputs. JSON Semantic Diff should infer `userId`, match rows by identity, and surface only the meaningful row changes instead of treating every reordered element as changed.

## Scoring model

Identity inference lives in `packages/core/src/diff/matching/identity-inference.ts`. Candidate quality considers uniqueness, completeness, match coverage, overlap, type consistency, a weak field-name hint, and volatility penalties. JSON Semantic Diff only auto-applies a candidate when both its score and its lead over competing candidates are strong enough.

## Analytics

The hosted demo uses [GoatCounter](https://www.goatcounter.com) for anonymous, cookie-free page-view analytics. It sets no cookies, no persistent identifiers, and collects no personal data — see GoatCounter's [privacy policy](https://www.goatcounter.com/privacy). Local development traffic (`localhost` and private IP ranges) is never tracked.

See `AGENTS.md` for product and implementation constraints.
