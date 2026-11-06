// measures the live site the way a visitor feels it: a real browser over the real internet, DNS, TLS and the edge proxy
// included. read-only (page loads and GET /api/), so it never signs in, sends mail or trips a rate limit.
// .github/workflows/perf.yml runs it weekly; by hand: pnpm perf (then pnpm perf:report). appends one JSON line per run
// to perf-data/results.jsonl (PERF_RESULTS overrides), the file scripts/perf/report.js reads
import { chromium, devices } from '@playwright/test'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const site = (process.env.PERF_SITE_URL ?? 'https://ckauth.chiragdev.com').replace(/\/$/, '')
const resultsFile = process.env.PERF_RESULTS ?? 'perf-data/results.jsonl'
// a run is compared only with runs from the same place: a GitHub runner in the US and a laptop in India differ by
// hundreds of milliseconds of distance alone
const where = process.env.PERF_WHERE ?? 'local'
// one page load is noisy (a slow DNS answer, a busy runner); the median of several is the number worth comparing
const samples = Number(process.env.PERF_SAMPLES ?? 7)

const pages = [
  { id: 'home', path: '/' },
  { id: 'sign-in', path: '/sign-in' },
]

const profiles = [
  { id: 'desktop', context: { viewport: { width: 1366, height: 768 } } },
  // lighthouse's mobile preset: a slow 4G connection (150 ms round trips, 1.6 Mbit/s down) and a phone CPU 4x slower
  // than the runner's, so a heavier bundle shows up here first. chrome applies the latency once per request, as a
  // minimum, not per network round trip, so a server already 150 ms away barely moves ttfb; bandwidth and cpu are exact
  {
    id: 'phone',
    context: { ...devices['Pixel 7'] },
    network: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
    cpuSlowdown: 4,
  },
]

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1]
const round = value => Math.round(value * 1000) / 1000

// one cold page load in a fresh context (no cache, no cookies, new connections), timed by the browser itself
async function loadOnce(browser, profile, path) {
  const context = await browser.newContext(profile.context)
  // largest contentful paint and layout shift are only reported to observers, so register them before the page loads
  await context.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0 }
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  const page = await context.newPage()
  if (profile.network) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown })
  }
  try {
    // networkidle, not load: the other pages render after their lazy chunk and /auth/me arrive
    await page.goto(`${site}${path}`, { waitUntil: 'networkidle', timeout: 60_000 })
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const resources = performance.getEntriesByType('resource')
      return {
        dns: nav.domainLookupEnd - nav.domainLookupStart,
        // tcp and tls together: the cost of a new connection, mostly round trips to the server
        connect: nav.connectEnd - nav.connectStart,
        ttfb: nav.responseStart,
        load: nav.loadEventEnd,
        lcp: window.__perf.lcp,
        cls: window.__perf.cls,
        kb: (nav.transferSize + resources.reduce((sum, entry) => sum + entry.transferSize, 0)) / 1024,
      }
    })
  } finally {
    await context.close()
  }
}

// round trips to the API from inside a loaded page, on a warm connection: network distance plus edge proxy plus express
async function apiRoundTrips(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(site)
    const times = await page.evaluate(async () => {
      const times = []
      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        const response = await fetch('/api/', { cache: 'no-store' })
        await response.text()
        if (!response.ok) throw new Error(`GET /api/ answered ${response.status}`)
        times.push(performance.now() - start)
      }
      return times
    })
    return { median: round(median(times)), p95: round(percentile(times, 0.95)) }
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()
const run = { date: new Date().toISOString(), site, where, samples, pages: {}, api: null }
try {
  for (const profile of profiles) {
    run.pages[profile.id] = {}
    for (const { id, path } of pages) {
      const loads = []
      for (let i = 0; i < samples; i++) loads.push(await loadOnce(browser, profile, path))
      run.pages[profile.id][id] = Object.fromEntries(Object.keys(loads[0]).map(key => [key, round(median(loads.map(load => load[key])))]))
      console.log(`${profile.id} ${path}: ttfb ${run.pages[profile.id][id].ttfb} ms, lcp ${run.pages[profile.id][id].lcp} ms`)
    }
  }
  run.api = await apiRoundTrips(browser)
  console.log(`api: median ${run.api.median} ms, p95 ${run.api.p95} ms`)
} finally {
  await browser.close()
}

// only a complete run is saved; a failure exits non-zero, which also fails the weekly job and emails the repo owner
mkdirSync(dirname(resultsFile), { recursive: true })
appendFileSync(resultsFile, JSON.stringify(run) + '\n')
console.log(`saved to ${resultsFile}`)
