# Contributing to JSON Semantic Diff

Thanks for your interest in contributing! This document covers everything you
need to get set up and send a good pull request.

## Prerequisites

- Node.js version matching `.nvmrc` (currently `v24.17.0`). If you use `nvm`,
  run `nvm use` from the repo root.
- npm (ships with Node). This repo is an **npm workspaces monorepo**, so all
  dependency installation happens from the repo root — do not run `npm
  install` inside `packages/core` or `packages/ui` individually.

## Getting started

```bash
git clone https://github.com/cchandurkar/json-semantic-diff.git
cd json-semantic-diff
nvm use   # optional, matches .nvmrc
npm install
```

## Repo layout

- `packages/core` — the framework-free JSON diff engine, published to npm as
  `json-semantic-diff`. Must not import Angular, RxJS, or DOM APIs.
- `packages/ui` — the Angular app that consumes `packages/core` and ships via
  GitHub Pages.

See [`AGENTS.md`](./AGENTS.md) for the full product intent, architecture
notes, and non-negotiable constraints (e.g. JSON content must never leave the
browser, no ML/AI in the diff path). Read it before making any change to
diff/matching logic or the UI's core interaction model.

## Running the app locally

```bash
npm run start --workspace=packages/ui
```

## Running tests

```bash
npm run test
```

This runs `packages/core`'s Vitest suite and `packages/ui`'s `ng test` suite
in sequence. You can also scope to a single workspace, e.g.:

```bash
npm run test --workspace=packages/core
npm run test --workspace=packages/ui
```

## Linting

```bash
npm run lint       # check only
npm run lint:fix    # auto-fix where possible
```

Lint runs ESLint (and Stylelint for `packages/ui` CSS) across both
workspaces.

## Formatting

```bash
npm run format        # write formatting fixes with Prettier
npm run format:check  # verify formatting without writing
```

## Commit message style

This repo does not enforce strict Conventional Commits. Follow the existing
history: short, imperative, present-tense summaries (e.g. `Fix search
highlighting and false-positive matches in Source view`, `Add Stylelint for
CSS formatting and structural checks`). Keep the subject line concise and
scoped to a single logical change.

## Pull request process

1. Fork the repo and create a branch off `main`.
2. Make your change, keeping it scoped and consistent with `AGENTS.md`.
3. Before opening a PR, run locally:
   ```bash
   npm run lint
   npm run test
   npm run build
   ```
4. Open the PR against `main`. CI (lint, test, build) must pass before merge.
5. Describe the change and link any related issue using the PR template.

## Releasing

`packages/core` (published to npm) and `packages/ui` (deployed to GitHub
Pages) are versioned and released independently, from your own machine:

```bash
npm run release:core          # bumps packages/core, defaults to a minor bump
npm run release:ui  -- patch  # bumps packages/ui with an explicit bump type
npm run release:core -- major
```

Each command (`scripts/release.mjs`) bumps that package's version, commits,
tags it (`core-vX.Y.Z` / `ui-vX.Y.Z`), and creates a GitHub Release, which in
turn triggers `publish-npm.yml` (npm publish) or `deploy-pages.yml`
(rebuild + redeploy) respectively. It refuses to run from a dirty working
tree, a non-`main` branch, or a `main` that's behind `origin/main`.

**Never create a `core-v*`/`ui-v*` tag or GitHub Release by hand.** Doing so
bypasses the version bump entirely, leaving `package.json` stale while the
tag claims a version that was never actually built or published — this has
happened before and caused real confusion. Always go through
`npm run release:core`/`npm run release:ui`.

## Reporting bugs / requesting features

Please use the issue templates under `.github/ISSUE_TEMPLATE/` when opening
a new issue — one for bug reports, one for feature requests.
