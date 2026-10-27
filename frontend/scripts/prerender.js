// runs after both vite builds (package.json "build"). writes two pages into dist/:
// - index.html: the home page rendered to real html, so crawlers and link previews see the content without running js
// - app.html: the empty shell for every other route (the web Caddyfile serves it), which must not carry the home page's markup
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'

const SITE_URL = 'https://ckauth.chiragdev.com'
const dist = new URL('../dist/', import.meta.url)
const { render } = await import(new URL('../dist-server/entry-server.js', import.meta.url).href)

function replaceOnce(html, search, replacement) {
  // fail the build rather than ship a page that silently lost its prerender
  if(!html.includes(search)) throw new Error(`prerender: "${search}" not found in index.html`)
  return html.replace(search, () => replacement)
}

const shell = await readFile(new URL('index.html', dist), 'utf8')

// the latin file of the font the first screen uses; preloading starts it with the html instead of after the css.
// the hindi font isn't preloaded: the page starts in english, and most visitors never switch
const fonts = (await readdir(new URL('assets/', dist))).filter(name => /^inter-latin-wght-normal-.+\.woff2$/.test(name))
if(fonts.length !== 1) throw new Error(`prerender: expected the inter latin font, found ${fonts.join(', ') || 'none'}`)
const preloads = fonts.map(name => `<link rel="preload" href="/assets/${name}" as="font" type="font/woff2" crossorigin />`).join('\n    ')
let appShell = replaceOnce(shell, '</head>', `  ${preloads}\n  </head>`)

// the theme script runs before first paint, so as a separate file it costs a round trip before anything shows.
// inlined, the csp must allow it by hash: deploy/ckauth.caddy carries 'sha256-…' in script-src, and the build fails
// if they differ. the check is skipped where deploy/ isn't present (the web image builds from frontend/ alone)
const themeScript = (await readFile(new URL('theme-init.js', dist), 'utf8')).trim()
const themeHash = `'sha256-${createHash('sha256').update(themeScript).digest('base64')}'`
const siteCaddy = await readFile(new URL('../../deploy/ckauth.caddy', import.meta.url), 'utf8').catch(() => null)
if(siteCaddy !== null && !siteCaddy.includes(themeHash)) {
  throw new Error(`prerender: public/theme-init.js changed; put ${themeHash} in script-src in deploy/ckauth.caddy`)
}
appShell = replaceOnce(appShell, '<script src="/theme-init.js"></script>', `<script>${themeScript}</script>`)

// home-only head tags: the canonical url, and structured data that gives search results the site's name.
// the description is taken from index.html so the two never drift apart
const description = appShell.match(/<meta name="description" content="([^"]*)"/)?.[1]
if(!description) throw new Error('prerender: index.html has no meta description')
const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'CKAuth', url: `${SITE_URL}/` },
    { '@type': 'WebApplication', name: 'CKAuth', url: `${SITE_URL}/`, description, applicationCategory: 'SecurityApplication', operatingSystem: 'Any' },
  ],
}).replaceAll('<', '\\u003c')
const homeHead = [
  `<link rel="canonical" href="${SITE_URL}/" />`,
  `<meta property="og:url" content="${SITE_URL}/" />`,
  // a data block, not a script the browser runs, so the csp's script-src doesn't apply to it
  `<script type="application/ld+json">${structuredData}</script>`,
].join('\n    ')

let home = replaceOnce(appShell, '</head>', `  ${homeHead}\n  </head>`)
// the home page is the landing page, so its css comes inline instead of as a render-blocking request
// (~11 kB gzip, already allowed by style-src 'unsafe-inline'). app.html keeps the cacheable stylesheet link
const stylesheet = home.match(/<link rel="stylesheet" crossorigin href="\/assets\/([^"]+\.css)">/)
if(!stylesheet) throw new Error('prerender: no stylesheet link in index.html')
const css = await readFile(new URL(`assets/${stylesheet[1]}`, dist), 'utf8')
home = replaceOnce(home, stylesheet[0], `<style>${css}</style>`)
home = replaceOnce(home, '<div id="root"></div>', `<div id="root" data-prerendered="/">${render('/')}</div>`)

await writeFile(new URL('app.html', dist), appShell)
await writeFile(new URL('index.html', dist), home)
console.log(`prerendered / into dist/index.html (${(home.length / 1024).toFixed(1)} kB), shell in dist/app.html`)
