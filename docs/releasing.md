---
tags:
  - documentation
  - releasing
  - npm
  - agentic_ai
  - agents
  - loops
---
# Releasing Agent Looper (`@dancingteeth/agent-looper`)

Publish **`@dancingteeth/agent-looper`** from GitHub repo **`dancingteeth/agent-looper`**.

CLI bins stay `agent-loop` / `agent-check` / …

## Preferred: trusted publishing (GitHub Actions OIDC)

No long-lived publish token. Workflow: [`.github/workflows/publish.yml`](../.github/workflows/publish.yml)
(on `main`, triggers on `v*` tags and `workflow_dispatch`).

Requires **npm CLI ≥ 11.5.1** and **Node ≥ 22.14** on the runner (we use Node 22).

**Status check:** `npm view @dancingteeth/agent-looper version` must succeed before trusted
publishing can complete a release. If that 404s, do the bootstrap publish below first —
npm’s Trusted Publisher UI attaches to an **existing** package.

### Bootstrap (one time — package must exist first)

Trusted publisher is configured on an **existing** npm package. If `0.1.0` is not on the registry yet:

1. On [npm Access Tokens](https://www.npmjs.com/settings/dancingteeth/tokens), create a **granular** token:
   - Read and write
   - Scope / package: `@dancingteeth/agent-looper` (or all packages under your user)
   - **Bypass 2FA**: on (browser will challenge your **security key**)
2. Locally (token in user npmrc for `registry.npmjs.org` only):

```bash
npm config set //registry.npmjs.org/:_authToken=npm_YOUR_TOKEN --location=user
cd /Users/paulzgordan/Projects/agent-loop
pnpm prepublishOnly
npm publish --registry=https://registry.npmjs.org --access public --ignore-scripts
```

3. Revoke that token after the first publish succeeds (or keep it only until trusted publishing is verified).

### Configure trusted publisher (browser + security key)

1. Open [package settings](https://www.npmjs.com/package/@dancingteeth/agent-looper) → **Settings** → **Trusted Publisher**
2. Choose **GitHub Actions** and set:

| Field | Value |
| --- | --- |
| Organization or user | `dancingteeth` |
| Repository | `agent-looper` |
| Workflow filename | `publish.yml` (filename only, not a path) |
| Environment name | *(leave empty unless you add a GitHub Environment)* |
| Allowed actions | **`npm publish`** (and optionally `npm stage publish`) |

3. Save. npm does **not** validate the config until the next CI publish — match names exactly.

**Symptom if missing / mismatched:** `npm error code E404` on
`PUT https://registry.npmjs.org/@dancingteeth%2fagent-looper` (npm hides 401 as 404 for
scoped packages). Fix the Trusted Publisher fields, then re-run **Actions → Publish**.

### Cut a release

```bash
git tag v0.1.2
git push origin v0.1.2
```

Or run **Actions → Publish → Run workflow** (`workflow_dispatch`).

After a green trusted publish, optional hardening on the package: **Publishing access** → “Require two-factor authentication and disallow tokens” (OIDC still works).

## Version bumps

```bash
npm version patch   # or minor / major — updates package.json + creates a tag
git push origin main --follow-tags
```

Example after `0.1.0`: bump in `package.json`, merge to `main`, then tag `v0.1.2` (skip burned tags if a prior publish attempt failed before npm).## Local publish (fallback)

Account is `auth-and-writes` with a **security key** (not TOTP). CLI `--otp=` will not work unless you also add an authenticator app. Prefer a bypass-2FA granular token or trusted publishing.

Provenance is generated automatically on trusted GitHub publishes; local `publishConfig.provenance` is off so CLI publish does not require CI OIDC.
