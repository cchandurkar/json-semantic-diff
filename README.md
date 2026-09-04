# DiffLens

DiffLens is a local-first JSON comparison app focused on meaningful differences rather than line-oriented text changes.

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
npm start
```

Open `http://localhost:4200`.

Production build:

```bash
npm run build
```

## Try the differentiator

Click **Example**. The `users` array is deliberately reordered between inputs. DiffLens should infer `userId`, match rows by identity, and surface only the meaningful row changes instead of treating every reordered element as changed.

## Scoring model

Identity inference lives in `src/app/core/diff/identity-inference.ts`. Candidate quality considers uniqueness, completeness, match coverage, overlap, type consistency, a weak field-name hint, and volatility penalties. DiffLens only auto-applies a candidate when both its score and its lead over competing candidates are strong enough.

See `AGENTS.md` for product and implementation constraints.
