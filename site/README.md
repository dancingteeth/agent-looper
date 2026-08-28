# Agent Looper landing page

Static marketing site for [@dancingteeth/agent-looper](https://github.com/dancingteeth/agent-looper).

## Local preview

```bash
npx --yes serve site
# open http://localhost:3000
```

Or open `index.html` directly in a browser.

## Deploy

GitHub Pages deploys `site/` on push to `main` via [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

After the first deploy, enable **Settings → Pages → Source: GitHub Actions** if needed. The site will be available at:

`https://dancingteeth.github.io/agent-looper/`

Technical reference remains in the repo root [`README.md`](../README.md).
