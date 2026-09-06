# Security Policy

JSON Semantic Diff is a local-first, browser-only JSON comparison tool. Per
its product principles (see [`AGENTS.md`](./AGENTS.md)), JSON content you
compare never leaves your browser — there are no network calls that upload,
persist, or log user JSON. As a result, the primary attack surface for this
project is:

- the client-side web app's code (`packages/ui`), and
- the parsing/diffing logic in the published npm package
  (`packages/core`, `json-semantic-diff`).

There is no backend service or user data store to compromise.

## Reporting a vulnerability

If you believe you've found a security vulnerability in this project, please
**do not open a public GitHub issue**. Instead, use GitHub's private
security advisory feature: go to the **Security** tab of this repository and
select **"Report a vulnerability"**. This lets us discuss and fix the issue
before any details are made public.

Please include as much detail as you can:

- a description of the vulnerability and its potential impact,
- steps to reproduce (including a minimal JSON input if relevant), and
- the affected package/version (`json-semantic-diff` npm version, or a
  commit/deployed version of the web app).

## Response expectations

This is a small open-source project maintained on a best-effort basis. There
is no formal SLA, but reported vulnerabilities will be triaged and addressed
as soon as reasonably possible.

## Supported versions

Security fixes are made against the latest published version of
`json-semantic-diff` and the latest deployed version of the web app. Older
versions are not separately patched.
