# Agent Looper landing page

Static marketing site for [@dancingteeth/agent-looper](https://github.com/dancingteeth/agent-looper).

## Local preview

```bash
npx --yes serve site
# open http://localhost:3000
```

Or open `index.html` directly in a browser.

## Deploy

Canonical host: **https://looper.dancingteeth.net/**

Production deploy rsyncs `site/` to our VPS nginx docroot (`/var/www/looper`) via Guga GitOps — not GitHub Pages. DNS for the hostname is managed separately (`site/CNAME` documents the domain).

Unknown paths are served from `site/404.html`. Markdown siblings (`index.md`, `about/index.md`, …) follow [llmstxt.org](https://llmstxt.org/). Origin nginx negotiates `Accept: text/markdown` on the HTML URL (the same URL serves markdown when requested).

Technical reference remains in the repo root [`README.md`](../README.md).
