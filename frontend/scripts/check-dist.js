// pre-PR checks on the built site (run after `pnpm build`, by scripts/pr-check.sh): what crawlers and link previews read,
// what blocks the first paint, size budgets, and nothing secret or debug-only shipped. exits 1 on any failure.
// run by scripts/check-pr.js after the frontend build
import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const SITE_URL = 'https://ckauth.chiragdev.com'
const dist = new URL('../dist/', import.meta.url)
const read = path => readFile(new URL(path, dist), 'utf8')
const failures = []
// warnings don't fail the build; they say a budget is nearly used up while there's still time to plan for it
const warnings = []
const check = (ok, message) => { if(!ok) failures.push(message) }
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
const kib = bytes => (bytes / 1024).toFixed(1)

// size limits in KiB, gzip. set just above today's numbers, so a regression fails the PR instead of slipping through.
// initialJs went 125 → 127 on 2 Nov 2026: the 24–27 Oct landing pages grew it to 127.0 on main before this check was committed
// homeHtml went 22 → 22.5 on 2 Nov 2026, when the inlined css carried every tailwind class in the app. since 7 Nov the
// home page inlines only the css it uses (scripts/critical-css.js), which took it from 22.49 to 18.97 KiB. the same day the
// hindi version was removed (copy, language switch, font): home JS 127.0 → 123.0 KiB, index.html 18.97 → 18.54 KiB.
// both budgets were then set tight on purpose, a quarter KiB above the new sizes, so growth is a decision, not drift:
// initialJs 127 → 123.25, homeHtml 22.5 → 18.75. raising one needs a reason in this comment, like the entries above
const budgets = { initialJs: 123.25, lazyChunk: 30, homeHtml: 18.75 }
// with tight budgets the warning has to come early: 0.1 KiB is about one new section's worth of classes
const warnWhenLeft = 0.1

const home = await read('index.html')
const shell = await read('app.html')
const head = home.slice(0, home.indexOf('</head>'))
const meta = (html, attribute, name) => decode(html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1] ?? '')

// --- seo: the home page says what it is, in the html itself
const title = decode(home.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')
const description = meta(home, 'name', 'description')
check(title.length >= 50 && title.length <= 60, `title is ${title.length} characters, want 50–60: "${title}"`)
// the landing page targets "sign-in and user accounts for your website" since 27 Oct (DEVLOG); keep the topic in the title
check(/sign-in/i.test(title), 'title should name the topic ("sign-in")')
check(description.length >= 140 && description.length <= 160, `meta description is ${description.length} characters, want 140–160`)
check(meta(home, 'property', 'og:title') === title, 'og:title differs from the title')
check(meta(home, 'property', 'og:description') === description, 'og:description differs from the meta description')
check(meta(home, 'property', 'og:url') === `${SITE_URL}/`, 'og:url missing or wrong')
check(meta(home, 'property', 'og:image').startsWith(`${SITE_URL}/`), 'og:image must be an absolute url on the site')
check(home.includes(`<link rel="canonical" href="${SITE_URL}/"`), 'canonical url missing or wrong')
check((home.match(/<h1[\s>]/g) ?? []).length === 1, 'the prerendered home page needs exactly one h1')
check(home.includes('data-prerendered="/"'), 'home page is not prerendered')
const jsonLd = home.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1]
try { check(JSON.parse(jsonLd ?? '')['@graph'].some(node => node.description === description), 'JSON-LD description differs from the meta description') } catch { failures.push('JSON-LD missing or invalid') }
check(!/<h1[\s>]|rel="canonical"|data-prerendered/.test(shell), 'app.html must be the empty shell (no h1, canonical or prerendered markup)')
const robots = await read('robots.txt')
check(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`) && !/^Disallow: \/\s*$/m.test(robots), 'robots.txt must point to the sitemap and not block the site')
check((await read('sitemap.xml')).includes(`<loc>${SITE_URL}/</loc>`), 'sitemap.xml must list the home page')
const ogImage = await readFile(new URL('og.png', dist))
check(ogImage.readUInt32BE(16) === 1200 && ogImage.readUInt32BE(20) === 630, 'og.png must be 1200×630')

// --- brand images: each png names the sha-256 of the svg it was rendered from (scripts/brand-images.mjs), so an edited
// source with a stale png fails here. a git checkout resets file dates, so comparing modification times can't work
const sourceOf = png => {
  for(let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    const text = png.toString('latin1', at + 8, at + 8 + png.readUInt32BE(at))
    if(png.toString('latin1', at + 4, at + 8) === 'tEXt' && text.startsWith('ckauth-source\0')) return text.slice(14)
  }
}
const brand = { 'og.png': '../og-image.svg', 'apple-touch-icon.png': '../brand/icon.svg', 'icon-192.png': '../brand/icon.svg', 'icon-512.png': '../brand/icon.svg' }
for(const [png, svg] of Object.entries(brand)) {
  const hash = createHash('sha256').update(await readFile(new URL(svg, dist))).digest('hex')
  const image = await readFile(new URL(png, dist)).catch(() => null)
  check(image && sourceOf(image) === hash, `${png} is missing or older than ${svg.slice(3)}: run pnpm brand:images`)
}
check(head.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png"') && head.includes('<link rel="manifest" href="/manifest.json"'), 'home page must link the apple-touch-icon and the manifest')

// --- optimisation: nothing blocks the first paint, and the downloads fit the budgets
check(!/<link rel="stylesheet"/.test(head), 'home page links a stylesheet (render-blocking); the css should be inlined')
check(!/<script(?![^>]*type="(module|application\/ld\+json)")[^>]*\ssrc=/.test(head), 'a classic <script src> in <head> blocks rendering')
const assets = await readdir(new URL('assets/', dist))
const gzipKib = async name => gzipSync(await readFile(new URL(`assets/${name}`, dist))).length / 1024
const initialScripts = [...home.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map(match => match[1])
let initialJs = 0
for(const name of initialScripts) initialJs += await gzipKib(name)
check(initialJs <= budgets.initialJs, `home page JavaScript is ${initialJs.toFixed(1)} KiB gzip, budget ${budgets.initialJs}`)
let largestLazy = { name: '', size: 0 }
for(const name of assets.filter(name => name.endsWith('.js') && !initialScripts.includes(name))) {
  const size = await gzipKib(name)
  if(size > largestLazy.size) largestLazy = { name, size }
}
check(largestLazy.size <= budgets.lazyChunk, `${largestLazy.name} is ${largestLazy.size.toFixed(1)} KiB gzip, budget ${budgets.lazyChunk} per lazy chunk`)
const homeGzip = gzipSync(home).length / 1024
check(homeGzip <= budgets.homeHtml, `index.html is ${homeGzip.toFixed(1)} KiB gzip (css inlined), budget ${budgets.homeHtml}`)
check((head.match(/rel="preload"/g) ?? []).length <= 2, 'more than two preloads compete with the page itself')

// --- critical css (scripts/critical-css.js): the home page inlines only the rules it can use, so these prove the
// optimisation can't cost a style. independent of critical-css.js on purpose: the same code checking itself proves nothing
const inlineCss = home.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
const fullSheet = shell.match(/<link rel="stylesheet" crossorigin href="\/assets\/([^"]+\.css)">/)?.[1]
const fullCss = fullSheet ? await read(`assets/${fullSheet}`) : ''
const cssClasses = text => new Set([...text.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+)/g)]
  .map(match => match[1].replace(/\\(?:([0-9a-fA-F]{1,6})\s?|(.))/g, (_, hex, char) => hex ? String.fromCodePoint(parseInt(hex, 16)) : char)))
const fullClasses = cssClasses(fullCss)
const inlineClasses = cssClasses(inlineCss)
const markupClasses = new Set([...home.matchAll(/\sclass="([^"]*)"/g)].flatMap(match => decode(match[1]).split(/\s+/)).filter(Boolean))
const unstyled = [...markupClasses].filter(name => fullClasses.has(name) && !inlineClasses.has(name))
check(!unstyled.length, `the inlined css dropped classes the home page uses: ${unstyled.slice(0, 8).join(' ')}`)
check(fullCss && inlineCss.length < fullCss.length, 'the home page should inline only its own css, not the full stylesheet')
// the full sheet must still arrive, after the markup (not render-blocking) and preloaded, or the lazy user menu and
// in-app navigation lose their styles. app.html carries the same file, so both pages share one cached download
const body = home.slice(home.indexOf('</head>'))
check(Boolean(fullSheet) && body.includes(`<link rel="stylesheet" crossorigin href="/assets/${fullSheet}">`), 'the home page must link the full stylesheet at the end of <body>')
check(Boolean(fullSheet) && head.includes(`<link rel="preload" href="/assets/${fullSheet}" as="style" crossorigin>`), 'the home page must preload the full stylesheet in <head>')

// --- security: no source maps, secrets or plain-http resources in what's served
check(!assets.some(name => name.endsWith('.map')), 'source maps are in dist (they publish the source)')
for(const name of ['index.html', 'app.html', ...assets.filter(name => /\.(js|css)$/.test(name)).map(name => `assets/${name}`)]) {
  const text = await read(name)
  if(/\bre_[A-Za-z0-9]{8,}_|private_[A-Za-z0-9+/=]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(text)) failures.push(`${name} contains something that looks like a secret`)
  if(/(?:src|href)="http:\/\//.test(text)) failures.push(`${name} loads something over plain http`)
  // the dev-only email designs page (src/pages/dev-emails.tsx) talks to an api route production doesn't have
  if(text.includes('/api/dev/emails')) failures.push(`${name} ships the dev-only email designs page`)
}

// measure before naming a cause: when a budget is tight, these say which part grew (7 Nov 2026: the guess was the
// dev-only pages, the measurement said the dashboard and admin css the home page never shows)
for(const [name, used, budget] of [['home page JavaScript', initialJs, budgets.initialJs], ['index.html', homeGzip, budgets.homeHtml]]) {
  if(used <= budget && budget - used < warnWhenLeft) warnings.push(`${name} is ${used.toFixed(1)} of ${budget} KiB gzip: plan the next win before a change fails`)
}
const gzipAlone = text => (gzipSync(text).length / 1024).toFixed(1)
const homeBreakdown = `inlined css ${gzipAlone(inlineCss)} KiB (${Math.round(100 * inlineCss.length / fullCss.length)}% of the full sheet), markup ${gzipAlone(home.replace(inlineCss, ''))} KiB, each gzipped alone`

for(const warning of warnings) console.log(`  warn  ${warning}`)
for(const failure of failures) console.log(`  FAIL  ${failure}`)
console.log(`dist checks: ${failures.length} failed, ${warnings.length} warnings · home JS ${initialJs.toFixed(1)} KiB, largest lazy chunk ${largestLazy.size.toFixed(1)} KiB (${largestLazy.name}), index.html ${homeGzip.toFixed(1)} KiB gzip (${homeBreakdown}), ${kib(ogImage.length)} KiB og.png`)
process.exit(failures.length ? 1 : 0)
