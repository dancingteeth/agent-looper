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

Custom domain: **https://looper.dancingteeth.net/**

1. Point a DNS CNAME `looper` → `dancingteeth.github.io` (or Cloudflare proxied CNAME to the Pages host).
2. Enable **Settings → Pages → Source: GitHub Actions** if needed.
3. After the first deploy, GitHub will pick up `site/CNAME`.

Unknown paths are `site/404.html` (GitHub Pages returns HTTP 404). Markdown siblings (`index.md`, `about/index.md`, …) follow [llmstxt.org](https://llmstxt.org/). GitHub Pages cannot set `Vary: Accept` or negotiate `Accept: text/markdown` on the HTML URL. After the domain is on Cloudflare, turn on [Markdown for Agents](https://acceptmarkdown.com/guides/cloudflare-markdown-for-agents) if you want the same URL to serve markdown.

`https://dancingteeth.github.io/agent-looper/` may still work as the default Pages host; treat `looper.dancingteeth.net` as canonical.

Technical reference remains in the repo root [`README.md`](../README.md).
