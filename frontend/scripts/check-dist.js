// pre-PR checks on the built site (run after `pnpm build`, by scripts/pr-check.sh): what crawlers and link previews read,
// what blocks the first paint, size budgets, and nothing secret or debug-only shipped. exits 1 on any failure.
// run by scripts/check-pr.js after the frontend build
import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const SITE_URL = 'https://ckauth.chiragdev.com'
const dist = new URL('../dist/', import.meta.url)
const read = path => readFile(new URL(path, dist), 'utf8')
const failures = []
const check = (ok, message) => { if(!ok) failures.push(message) }
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
const kib = bytes => (bytes / 1024).toFixed(1)

// size limits in KiB, gzip. set just above today's numbers, so a regression fails the PR instead of slipping through.
// initialJs went 125 → 127 on 2 Nov 2026: the 24–27 Oct landing pages grew it to 127.0 on main before this check was committed
// homeHtml went 22 → 22.5 on 2 Nov 2026: the inlined css carries every tailwind class in the app, not only the home page's,
// and the dashboard's device list, profile details and avatar viewer added 0.1 KiB of them
const budgets = { initialJs: 127, lazyChunk: 30, homeHtml: 22.5 }

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

// --- security: no source maps, secrets or plain-http resources in what's served
check(!assets.some(name => name.endsWith('.map')), 'source maps are in dist (they publish the source)')
for(const name of ['index.html', 'app.html', ...assets.filter(name => /\.(js|css)$/.test(name)).map(name => `assets/${name}`)]) {
  const text = await read(name)
  if(/\bre_[A-Za-z0-9]{8,}_|private_[A-Za-z0-9+/=]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(text)) failures.push(`${name} contains something that looks like a secret`)
  if(/(?:src|href)="http:\/\//.test(text)) failures.push(`${name} loads something over plain http`)
  // the dev-only email designs page (src/pages/dev-emails.tsx) talks to an api route production doesn't have
  if(text.includes('/api/dev/emails')) failures.push(`${name} ships the dev-only email designs page`)
}

for(const failure of failures) console.log(`  FAIL  ${failure}`)
console.log(`dist checks: ${failures.length} failed · home JS ${initialJs.toFixed(1)} KiB, largest lazy chunk ${largestLazy.size.toFixed(1)} KiB (${largestLazy.name}), index.html ${homeGzip.toFixed(1)} KiB gzip, ${kib(ogImage.length)} KiB og.png`)
process.exit(failures.length ? 1 : 0)
