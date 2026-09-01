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
    expect(agentPanel).toContain(
      'Keep @dancingteeth/agent-looper in package.json even if you gitignore',
    )
    expect(agentPanel).toContain("Don't only npx it.")

    const humanSnippet = html.slice(
      html.indexOf('id="install-snippet-human"'),
      html.indexOf('</pre>', html.indexOf('id="install-snippet-human"')),
    )
    expect(humanSnippet).toContain('pnpm add -D @dancingteeth/agent-looper @cursor/sdk')
    expect(humanSnippet).toContain(
      '# keep @dancingteeth/agent-looper in package.json even if .cursor/loops is gitignored',
    )
    expect(humanSnippet).toContain("don't only npx it")
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
    expect(md).toContain(
      'Keep @dancingteeth/agent-looper in package.json even if you gitignore',
    )
    expect(md).toContain(
      '# keep @dancingteeth/agent-looper in package.json even if .cursor/loops is gitignored',
    )
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

  it('analytics.js uses cookieless PostHog with install copy and Grok Bot add capture', () => {
    const js = readSite('analytics.js')
    expect(js).toContain("cookieless_mode: 'always'")
    expect(js).toContain('autocapture: false')
    expect(js).toContain("person_profiles: 'never'")
    expect(js).toContain('install_copy_clicked')
    expect(js).toContain('installCopyQueue')
    expect(js).toContain('flushInstallCopyQueue')
    expect(js).toContain('grok_bot_add_clicked')
    expect(js).toContain('grokBotAddQueue')
    expect(js).toContain('flushGrokBotAddQueue')
    expect(js).toContain('#grok-bot-add')
    expect(js).toMatch(/posthogReady\s*=\s*true/)
    expect(js).toContain('flushInstallCopyQueue()')
    expect(js).toContain('flushGrokBotAddQueue()')
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
    expect(html).toContain('harness-operator')
    expect(html).toContain('looper-bot.png')
    expect(html).toContain('Add to Grok Bot')
    expect(html).toMatch(/width="120"/)
    expect(html).toContain('harness-operator__shot')
    expect(html).toContain('harness-operator__title">Agent Looper Grok Bot')
    expect(html).toContain('harness-section-label">Operator')
    expect(html).toContain('id="harness-runtimes-heading">Runtimes')
    expect(html).toContain('class="harness-grid"')
    const jumpRow = html.match(/<nav class="harness-logos"[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(jumpRow).not.toMatch(/grok-bot/i)
    expect(jumpRow).not.toContain('looper-bot')
    expect(html).not.toContain('href="#grok-bot"')

    const md = readSite('harnesses/index.md')
    expect(md).toContain('https://x.ai/bot/AETdGbRRNWfckrRGv22LD')
    expect(md).toContain('[Add to Grok Bot]')
    const operatorTagline =
      "You say what to build and how to know it's done. It keeps a coding agent working on your computer until that check passes."
    expect(html).toContain(operatorTagline)
    expect(md).toContain(operatorTagline)
    const taglineText =
      html.match(/class="harness-operator__tagline">([^<]+)/)?.[1]?.trim() ?? ''
    expect(taglineText).toBe(operatorTagline)
    expect(taglineText).not.toMatch(/\bloop\b/i)
    expect(taglineText).not.toMatch(/fresh worker/i)
    expect(md).toContain('## Operator — Agent Looper Grok Bot')
    expect(md).toContain('## Runtimes')
    expect(md).toContain('looper-bot.png')
  })

  it('Cline runtime card describes judge as optional, not a Cursor default', () => {
    const html = readSite('harnesses/index.html')
    const clineCard =
      html.match(/<article class="harness-card" id="cline">[\s\S]*?<\/article>/)?.[0] ?? ''
    expect(clineCard).toMatch(/any runtime/i)
    expect(clineCard).toMatch(/optional/i)
    expect(clineCard).not.toMatch(/Composer/i)
    expect(clineCard).not.toMatch(/Judge Cursor/)
    expect(clineCard).not.toMatch(/reviewRuntime:\s*cline/i)

    const md = readSite('harnesses/index.md')
    const clineSection = md.slice(
      md.indexOf('### Cline'),
      md.indexOf('### OpenCode'),
    )
    expect(clineSection).toMatch(/any runtime/i)
    expect(clineSection).toMatch(/optional/i)
    expect(clineSection).not.toMatch(/Composer/i)
    expect(clineSection).not.toMatch(/Judge: Cursor/)
    expect(clineSection).not.toMatch(/reviewRuntime:\s*cline/i)
  })

  it('OpenCode, Pi, and Codex runtime cards describe judge as optional, not a Cursor default', () => {
    const html = readSite('harnesses/index.html')
    const md = readSite('harnesses/index.md')
    const cases = [
      { id: 'opencode', mdHeading: '### OpenCode', mdEnd: '### Pi' },
      { id: 'pi', mdHeading: '### Pi', mdEnd: '### Codex' },
      { id: 'codex', mdHeading: '### Codex', mdEnd: '### Muse Code' },
    ] as const

    for (const { id, mdHeading, mdEnd } of cases) {
      const card =
        html.match(
          new RegExp(`<article class="harness-card" id="${id}">[\\s\\S]*?<\\/article>`),
        )?.[0] ?? ''
      expect(card, id).toMatch(/any runtime/i)
      expect(card, id).toMatch(/optional/i)
      expect(card, id).not.toMatch(/Judge Cursor/)
      expect(card, id).not.toMatch(new RegExp(`reviewRuntime:\\s*${id}`, 'i'))

      const mdStart = md.indexOf(mdHeading)
      const mdSlice = mdEnd ? md.slice(mdStart, md.indexOf(mdEnd)) : md.slice(mdStart)
      expect(mdSlice, id).toMatch(/any runtime/i)
      expect(mdSlice, id).toMatch(/optional/i)
      expect(mdSlice, id).not.toMatch(/Judge: Cursor/)
      expect(mdSlice, id).not.toMatch(new RegExp(`reviewRuntime:\\s*${id}`, 'i'))
    }
  })

  it('Muse Code runtime card is in testing with contributor worker and optional judge', () => {
    const html = readSite('harnesses/index.html')
    const museCard =
      html.match(/<article class="harness-card" id="muse">[\s\S]*?<\/article>/)?.[0] ?? ''
    expect(museCard).toContain('id="muse"')
    expect(museCard).toContain('Muse Code')
    expect(museCard).toMatch(/in testing/i)
    expect(museCard).toContain('harness-card__status')
    expect(museCard).toContain('--runtime muse')
    expect(museCard).toContain('muse-spark-1.2-contributor')
    expect(museCard).toMatch(/any runtime/i)
    expect(museCard).toMatch(/optional/i)
    expect(museCard).not.toMatch(/Composer/i)
    expect(museCard).not.toMatch(/Judge Cursor/)
    expect(museCard).not.toMatch(/reviewRuntime:\s*muse/i)
    expect(museCard).toContain('https://dev.meta.ai/docs/muse-code')
    expect(museCard).toContain('@muse-code/sdk')
    expect(museCard).toMatch(/Not on minmax/i)
    expect(museCard).not.toMatch(/\bMCP\b/i)

    const md = readSite('harnesses/index.md')
    const museSection = md.slice(md.indexOf('### Muse Code'))
    expect(museSection).toMatch(/in testing/i)
    expect(museSection).toContain('muse-spark-1.2-contributor')
    expect(museSection).toMatch(/any runtime/i)
    expect(museSection).toMatch(/optional/i)
    expect(museSection).not.toMatch(/Composer/i)
    expect(museSection).not.toMatch(/Judge: Cursor/)
    expect(museSection).not.toMatch(/reviewRuntime:\s*muse/i)
    expect(museSection).not.toMatch(/\bMCP\b/i)

    const jumpRow = html.match(/<nav class="harness-logos"[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(jumpRow).toContain('href="#muse"')
    expect(jumpRow).toContain('Muse Code')
    expect(jumpRow).toContain('harness-logo--text-only')
  })

  it('homepage and llms.txt list Muse Code in testing and include muse in runtime union', () => {
    const html = readSite('index.html')
    const md = readSite('index.md')
    const llms = readSite('llms.txt')
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

    const agentsQuestion = faq?.mainEntity?.find(
      (q) => q.name === 'Which coding agents does Agent Looper work with?',
    )

    for (const surface of [html, md, llms, agentsQuestion?.acceptedAnswer?.text ?? ''] as const) {
      expect(surface).toMatch(/Muse Code/i)
      expect(surface).toMatch(/in testing/i)
    }

    for (const surface of [html, md, llms] as const) {
      expect(surface).toMatch(/codex\|dsh\|muse/)
    }

    for (const surface of [html, md] as const) {
      expect(surface).toMatch(/detect what's installed.*Muse/i)
    }

    expect(html).toContain('harnesses/#muse')
    expect(html).not.toMatch(/\bMCP\b/i)
  })

  it('help section leads with dep, issues, optional telemetry, and Ko-fi', () => {
    const html = readSite('index.html')
    expect(html).toContain('id="help"')
    expect(html).toContain('public <code>package.json</code>')
    expect(html).toContain('gitignore')
    expect(html).toContain('AGENT_LOOPER_TELEMETRY=1')
    expect(html).toContain('https://ko-fi.com/dancingteeth')
    expect(html).toContain('class="kofi-btn"')

    const footer = html.slice(html.indexOf('class="site-footer"'))
    expect(footer).toContain('https://ko-fi.com/dancingteeth')

    const md = readSite('index.md')
    expect(md).toContain('## If this is useful')
    expect(md).toContain('package.json')
    expect(md).toContain('gitignore')
    expect(md).toContain('AGENT_LOOPER_TELEMETRY=1')
    expect(md).toContain('https://ko-fi.com/dancingteeth')
  })

  it('each page with nav has header Ko-fi link with coffee SVG', () => {
    const pages = [
      'index.html',
      'about/index.html',
      'contact/index.html',
      'docs/index.html',
      'privacy/index.html',
      'harnesses/index.html',
      '404.html',
    ]
    const coffeeSvg = '<path d="M10 2v2"/>'
    for (const page of pages) {
      const html = readSite(page)
      expect(html, page).toContain('<nav class="nav">')
      const navStart = html.indexOf('<nav class="nav">')
      const navEnd = html.indexOf('</nav>', navStart)
      const nav = html.slice(navStart, navEnd)
      expect(nav, page).toContain('class="nav-kofi"')
      expect(nav, page).toContain('https://ko-fi.com/dancingteeth')
      expect(nav, page).toContain(coffeeSvg)
      expect(nav, page).toMatch(/aria-label="Support on Ko-fi"/)
      expect(nav, page).toContain('target="_blank"')
      expect(nav, page).toContain('rel="noopener noreferrer"')
    }
  })

  it('footer Ko-fi link on every page with site-footer', () => {
    const pages = [
      'index.html',
      'about/index.html',
      'contact/index.html',
      'docs/index.html',
      'privacy/index.html',
      'harnesses/index.html',
      '404.html',
    ]
    for (const page of pages) {
      const html = readSite(page)
      expect(html, page).toContain('class="site-footer"')
      const footer = html.slice(html.indexOf('class="site-footer"'))
      expect(footer, page).toContain('https://ko-fi.com/dancingteeth')
      expect(footer, page).toMatch(/Privacy[\s\S]{0,120}Ko-fi/)
    }
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
      expect(html, path.relative(siteRoot, file)).toContain('analytics.js')
    }
  })
})
