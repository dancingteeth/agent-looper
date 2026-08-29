import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const siteRoot = path.resolve(import.meta.dirname, '../../site')

function readSite(...parts: string[]): string {
  return fs.readFileSync(path.join(siteRoot, ...parts), 'utf8')
}

function visibleText(html: string): string {
  const without = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return without.replace(/\s+/g, ' ').trim()
}

function jsonLdGraph(html: string): unknown[] {
  const match = html.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
  )
  expect(match?.[1]).toBeTruthy()
  const parsed: unknown = JSON.parse(match![1]!)
  expect(parsed).toMatchObject({ '@graph': expect.any(Array) })
  return (parsed as { '@graph': unknown[] })['@graph']
}

describe('landing agent readiness', () => {
  it('homepage HTML has an H1 and 500+ chars without JavaScript', () => {
    const html = readSite('index.html')
    expect(html).toMatch(/<h1>[^<]+<\/h1>/)
    expect(visibleText(html).length).toBeGreaterThanOrEqual(500)
  })

  it('advertises markdown alternate and llms.txt describedby', () => {
    const html = readSite('index.html')
    expect(html).toContain('rel="alternate" type="text/markdown"')
    expect(html).toContain('https://looper.dancingteeth.net/index.md')
    expect(html).toContain('rel="describedby"')
    expect(html).toContain('https://looper.dancingteeth.net/llms.txt')
  })

  it('ships markdown siblings for crawlable pages', () => {
    const files = [
      'index.md',
      '404.md',
      'about/index.md',
      'contact/index.md',
      'privacy/index.md',
      'docs/index.md',
    ]
    for (const file of files) {
      const body = readSite(file)
      expect(body.startsWith('# '), file).toBe(true)
      expect(body.length, file).toBeGreaterThan(200)
    }
  })

  it('404 page points agents at sitemap and llms.txt with root-relative assets', () => {
    const html = readSite('404.html')
    expect(html).toMatch(/<h1>Not found<\/h1>/)
    expect(html).toContain('noindex')
    expect(html).not.toMatch(/rel="canonical"/)
    expect(html).toContain('href="/styles.css?v=')
    expect(html).toContain('href="/docs/"')
    expect(html).toContain('href="/llms.txt"')
    expect(html).toContain('href="/sitemap.xml"')
    const md = readSite('404.md')
    expect(md).toContain('# Not found')
    expect(md).toContain('llms.txt')
  })

  it('trust and docs pages have Agent Looper in the H1 and 500+ chars', () => {
    const pages = ['about/index.html', 'contact/index.html', 'privacy/index.html', 'docs/index.html']
    for (const file of pages) {
      const html = readSite(file)
      expect(html, file).toMatch(/<h1>[^<]*Agent Looper[^<]*<\/h1>/)
      expect(visibleText(html).length, file).toBeGreaterThanOrEqual(500)
    }
  })

  it('llms.txt follows llmstxt.org v2 and includes when-to-use guidance', () => {
    const text = readSite('llms.txt')
    expect(text.startsWith('# Agent Looper\n')).toBe(true)
    expect(text).toMatch(/^> /m)
    expect(text).toMatch(/When to use Agent Looper:/)
    expect(text).toMatch(/When not to use Agent Looper:/)
    expect(text).toMatch(/How an agent should call it:/)
    expect(text).toMatch(/^## Developer resources$/m)
    expect(text).toMatch(/- \[Agent Looper developer resources\]\(/)
    expect(text).toContain('@dancingteeth/agent-looper')
  })

  it('JSON-LD includes Organization contactPoint', () => {
    const graph = jsonLdGraph(readSite('index.html'))
    const org = graph.find(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        (node as { '@type'?: string })['@type'] === 'Organization',
    ) as {
      contactPoint?: { contactType?: string; url?: string }
      name?: string
    }
    expect(org?.name).toBe('dancingteeth')
    expect(org?.contactPoint?.contactType).toBe('customer support')
    expect(org?.contactPoint?.url).toContain('github.com/dancingteeth/agent-looper/issues')
  })

  it('ships .nojekyll so markdown files stay markdown on static hosts', () => {
    expect(fs.existsSync(path.join(siteRoot, '.nojekyll'))).toBe(true)
  })

  it('robots.txt and license.xml declare RSL 1.0 AI training permission', () => {
    const robots = readSite('robots.txt')
    expect(robots).toContain(
      'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    )
    expect(robots).toContain(
      'License: https://looper.dancingteeth.net/license.xml',
    )
    const licenseLineIdx = robots.indexOf('License:')
    const userAgentIdx = robots.indexOf('User-agent:')
    expect(licenseLineIdx).toBeGreaterThanOrEqual(0)
    expect(userAgentIdx).toBeGreaterThan(licenseLineIdx)
    expect(robots).toContain('Allow: /')
    expect(robots).toContain(
      'Sitemap: https://looper.dancingteeth.net/sitemap.xml',
    )

    const license = readSite('license.xml')
    expect(license).toContain('xmlns="https://rslstandard.org/rsl"')
    expect(license).toContain(
      '<permits type="usage">search ai-input ai-train</permits>',
    )
    expect(license).toContain('<payment type="free"/>')
    expect(license).not.toMatch(/server=/)

    const sitemap = readSite('sitemap.xml')
    expect(sitemap).toContain(
      'https://looper.dancingteeth.net/license.xml',
    )
  })

  it('install section has For agent / For human switcher with agent as default', () => {
    const html = readSite('index.html')
    expect(html).toContain('For agent')
    expect(html).toContain('For human')
    expect(html).toMatch(/id="install-view-agent"[^>]*checked/)
    expect(html).toMatch(/aria-selected="true"[^>]*>For agent</)

    const agentPanel = html.slice(
      html.indexOf('id="install-panel-agent"'),
      html.indexOf('id="install-panel-human"'),
    )
    expect(agentPanel).toContain('Set up Agent Looper in this repo')
    expect(agentPanel).toContain('pnpm add -D @dancingteeth/agent-looper @cursor/sdk')

    const humanSnippet = html.slice(
      html.indexOf('id="install-snippet-human"'),
      html.indexOf('</pre>', html.indexOf('id="install-snippet-human"')),
    )
    expect(humanSnippet).toContain('pnpm add -D @dancingteeth/agent-looper @cursor/sdk')
    expect(humanSnippet).toContain('export CURSOR_API_KEY=…   # or: doppler run -- …')
    expect(humanSnippet).toContain('pnpm exec agent-loop-init')
    expect(humanSnippet).toContain(
      '# edit verify.sh until `bash .cursor/loops/my-task/verify.sh` is honest',
    )
    expect(humanSnippet).toContain(
      'pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate',
    )
  })

  it('index.md includes agent install prompt before human terminal commands', () => {
    const md = readSite('index.md')
    const agentIdx = md.indexOf('Set up Agent Looper in this repo')
    const humanIdx = md.indexOf('### For human')
    expect(agentIdx).toBeGreaterThan(-1)
    expect(humanIdx).toBeGreaterThan(agentIdx)
    expect(md).toContain('pnpm add -D @dancingteeth/agent-looper @cursor/sdk')
    expect(md).toContain("Don't loop on subjective taste.")
  })

  it('every HTML page cache-busts styles.css when linked', () => {
    const htmlFiles: string[] = []
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.html')) htmlFiles.push(full)
      }
    }
    walk(siteRoot)
    expect(htmlFiles.length).toBeGreaterThan(0)
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8')
      if (!html.includes('styles.css')) continue
      expect(html, path.relative(siteRoot, file)).toMatch(/styles\.css\?v=/)
    }
  })

  it('names cost presets and reverse repair copy in HTML, markdown, and JSON-LD', () => {
    const html = readSite('index.html')
    const md = readSite('index.md')
    const graph = jsonLdGraph(html)

    const faq = graph.find(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        (node as { '@type'?: string })['@type'] === 'FAQPage',
    ) as {
      mainEntity?: Array<{
        name?: string
        acceptedAnswer?: { text?: string }
      }>
    }

    const presetsQuestion = faq?.mainEntity?.find(
      (q) => q.name === 'How do Agent Looper worker and judge presets work?',
    )
    const reverseQuestion = faq?.mainEntity?.find(
      (q) => q.name === 'What if the code is already broken?',
    )

    for (const preset of ['minmax', 'balanced', 'cursor'] as const) {
      expect(html).toContain(preset)
      expect(md).toContain(preset)
      expect(presetsQuestion?.acceptedAnswer?.text).toContain(preset)
    }

    expect(html).toContain('What if the code is already broken?')
    expect(html).toContain('Reverse starts from a red check')
    expect(md).toContain('What if the code is already broken?')
    expect(md).toContain('Reverse starts from a red check')
    expect(reverseQuestion?.acceptedAnswer?.text).toContain(
      'Reverse starts from a red check',
    )
    expect(reverseQuestion?.acceptedAnswer?.text).toContain(
      "Don't copy the broken internals",
    )
  })

  it('names 0.4.5 hang switch, alive skill, and report card in HTML, markdown, and JSON-LD', () => {
    const html = readSite('index.html')
    const md = readSite('index.md')
    const graph = jsonLdGraph(html)

    const faq = graph.find(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        (node as { '@type'?: string })['@type'] === 'FAQPage',
    ) as {
      mainEntity?: Array<{
        name?: string
        acceptedAnswer?: { text?: string }
      }>
    }

    const stuckQuestion = faq?.mainEntity?.find(
      (q) => q.name === "What happens if Agent Looper's worker is stuck?",
    )
    const aliveQuestion = faq?.mainEntity?.find(
      (q) => q.name === 'How do I know if a loop is still alive?',
    )
    const reportQuestion = faq?.mainEntity?.find(
      (q) => q.name === 'What do I get when a loop finishes?',
    )

    const hangSwitch =
      'switches right away — it does not wait for the stuck-check count'
    const aliveSkill = 'check-running-loops'
    const reportCard = 'report card'

    for (const surface of [html, md] as const) {
      expect(surface).toContain(hangSwitch)
      expect(surface).toContain(aliveSkill)
      expect(surface.toLowerCase()).toContain(reportCard)
    }

    expect(stuckQuestion?.acceptedAnswer?.text).toContain(hangSwitch)
    expect(aliveQuestion?.acceptedAnswer?.text).toContain(aliveSkill)
    expect(aliveQuestion?.acceptedAnswer?.text).toContain('IDE job list will lie')
    expect(reportQuestion?.acceptedAnswer?.text?.toLowerCase()).toContain(
      reportCard,
    )

    expect(html).toContain('tui-answer--alive')
    expect(html).toContain('tui-answer--report')
  })

  it('privacy pages describe cookieless PostHog EU analytics', () => {
    const html = readSite('privacy/index.html')
    const md = readSite('privacy/index.md')
    for (const body of [html, md]) {
      expect(body).toMatch(/PostHog/i)
      expect(body).toMatch(/EU|eu\.i\.posthog\.com/i)
      expect(body).toMatch(/cookieless/i)
      expect(body).toMatch(/\$pageview|page view/i)
      expect(body).toContain('install_copy_clicked')
      expect(body).toContain('grok_bot_add_clicked')
    }
  })

  it('site tree has no committed PostHog project keys', () => {
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else {
          const body = fs.readFileSync(full, 'utf8')
          expect(body, path.relative(siteRoot, full)).not.toMatch(/phc_/)
        }
      }
    }
    walk(siteRoot)
  })

  it('analytics.js uses cookieless PostHog with install copy capture', () => {
    const js = readSite('analytics.js')
    expect(js).toContain("cookieless_mode: 'always'")
    expect(js).toContain('autocapture: false')
    expect(js).toContain("person_profiles: 'never'")
    expect(js).toContain('install_copy_clicked')
    expect(js).toContain('installCopyQueue')
    expect(js).toContain('flushInstallCopyQueue')
    expect(js).toMatch(/posthogReady\s*=\s*true/)
    expect(js).toContain('flushInstallCopyQueue()')
  })

  it('index.html only emits install copy analytics for install snippet ids', () => {
    const html = readSite('index.html')
    const guard = "id === 'install-snippet-agent' || id === 'install-snippet-human'"
    expect(html).toContain(guard)
    expect(html.indexOf('looper:install_copy_clicked')).toBeGreaterThan(html.indexOf(guard))
  })

  it('harnesses Grok Bot operator card links to the public x.ai bot', () => {
    const html = readSite('harnesses/index.html')
    expect(html).toContain('https://x.ai/bot/AETdGbRRNWfckrRGv22LD')
    expect(html).toContain('id="grok-bot-add"')
    expect(html).toContain('harness-block--operator')
    expect(html).toContain('grok-bot-hex.png')
    expect(html).toContain('Add to Grok Bot')

    const md = readSite('harnesses/index.md')
    expect(md).toContain('https://x.ai/bot/AETdGbRRNWfckrRGv22LD')
    expect(md).toContain('[Add to Grok Bot]')
    expect(md).toContain(
      'Runs Agent Looper on your computer. Frozen goal, determined check, fresh worker every round.',
    )
  })

  it('every HTML page loads analytics.js', () => {
    const htmlFiles: string[] = []
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.html')) htmlFiles.push(full)
      }
    }
    walk(siteRoot)
    expect(htmlFiles.length).toBeGreaterThanOrEqual(6)
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8')
      expect(html, path.relative(siteRoot, file)).toMatch(/analytics\.js\?v=/)
    }
  })
})
