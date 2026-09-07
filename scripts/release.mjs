#!/usr/bin/env node
// Cuts a release for one package: bumps its version, commits, tags, pushes,
// and creates a GitHub Release. Run via `npm run release:core` / `npm run
// release:ui` (optionally `-- patch`/`-- major` to override the default
// minor bump), never by creating a tag/release by hand - that's what
// caused the core-v1.0.0/ui-v1.0.0 incidents (tag existed, package.json
// never actually bumped).
//
// A human-created release (this script, via your own `gh` login) fires
// each workflow's `on: release: types: [published]` listener normally -
// unlike a release created by a GitHub Actions workflow's own GITHUB_TOKEN,
// which GitHub's loop-prevention rule blocks from cascading. That's why
// this lives here instead of inside a workflow: publish-npm.yml/
// deploy-pages.yml just react to the release this script creates, no
// separate "trigger downstream workflow" dispatch step needed.
//
// Usage:
//   node scripts/release.mjs <core|ui> [patch|minor|major]   (default: minor)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , pkgArg, bumpArg = 'minor'] = process.argv;

const VALID_PACKAGES = ['core', 'ui'];
const VALID_BUMPS = ['patch', 'minor', 'major'];

if (!VALID_PACKAGES.includes(pkgArg)) {
  console.error(`Usage: node scripts/release.mjs <${VALID_PACKAGES.join('|')}> [${VALID_BUMPS.join('|')}]`);
  process.exit(1);
}
if (!VALID_BUMPS.includes(bumpArg)) {
  console.error(`Invalid bump type "${bumpArg}". Must be one of: ${VALID_BUMPS.join(', ')}`);
  process.exit(1);
}

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

const status = capture('git status --porcelain');
if (status) {
  console.error('Working tree is not clean. Commit or stash changes before releasing.');
  process.exit(1);
}

const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`Refusing to release from branch "${branch}" - releases must be cut from main.`);
  process.exit(1);
}

run('git fetch origin main --quiet');
const behind = capture('git rev-list --count HEAD..origin/main');
if (behind !== '0') {
  console.error(`Local main is behind origin/main by ${behind} commit(s). Run "git pull" first.`);
  process.exit(1);
}

const pkgDir = `packages/${pkgArg}`;
const pkgJsonPath = `${pkgDir}/package.json`;

console.log(`\nBumping ${pkgDir} (${bumpArg})...\n`);
run(`npm version ${bumpArg} -w ${pkgDir} --no-git-tag-version`);

const version = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
const tag = `${pkgArg}-v${version}`;

run(`git add package-lock.json ${pkgJsonPath}`);
run(`git commit -m "chore: release ${tag}"`);
run(`git push origin ${branch}`);

run(`git tag ${tag}`);
run(`git push origin ${tag}`);

run(`gh release create ${tag} --title "${tag}" --target ${branch} --generate-notes`);

console.log(`\nReleased ${tag}.`);
console.log(
  pkgArg === 'core'
    ? '  -> npm publish will run shortly: gh run watch --workflow=publish-npm.yml'
    : '  -> Pages deploy will run shortly: gh run watch --workflow=deploy-pages.yml'
);
