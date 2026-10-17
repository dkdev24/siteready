# siteready reference fixture: Next.js (App Router) monorepo on AWS (CloudFront + OpenNext)

A generic npm-workspaces monorepo: the Next.js app lives in `apps/web`, and the deploy tooling is
a sibling `infra/` package (a CDK project depending on `cdk-nextjs-standalone`, deliberately **not**
a workspace member, so nothing is installed for it). Exercises two things the single-app
`nextjs-vercel` fixture can't:

- **Monorepo path detection.** Pointed at the repo root, `detectStack` finds the one Next.js
  package (`siteRoot` = `apps/web`) and installs, builds and serves from there.
- **`aws-cloudfront-opennext` platform detection.** No `vercel.json`/`netlify.toml`; the OpenNext
  signal comes from the sibling infra package, not from the app.

Reference for `../../src/platforms/aws-cloudfront-opennext.js` (+ `../../src/fixers/nextjs.js`).
It commits **no `.md` files**: `apps/web`'s `postbuild` runs `scripts/agent-readiness.mjs`, which
generates `public/llms.txt` and the `.md` mirrors from the built pages (git-ignored). `verify-loop`
checks that `llms-txt-exists`, `markdown-url-support` and `content-negotiation` flip fail → pass.
Checked in with the fixers already applied (the "after" state); `scripts/verify-loop.js` strips it
back to "before" in a temp copy.

## What this can and can't verify

`verify-loop` runs `next start`, which executes the app's own `proxy.js`, so content negotiation is
checked for real. It does **not** run CloudFront or the OpenNext server function: cache-key
behavior and whether `public/*.md` is reachable through CloudFront can only be confirmed with a scan
of a deployed URL. The platform fixer says so in its warnings.

```sh
cd fixtures/nextjs-opennext-monorepo
npm install
node ../../src/cli.js scan-local . --scanners afdocs --sampling deterministic
```
