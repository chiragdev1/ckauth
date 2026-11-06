// turns perf-data/results.jsonl (written by scripts/perf/measure.js) into a markdown report: this week against last week
// as a table, and the trend as charts. github renders the ```mermaid blocks as charts, so the report is the perf-data
// branch's README.md (.github/workflows/perf.yml) and the weekly job's summary page. by hand: pnpm perf:report
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const resultsFile = process.env.PERF_RESULTS ?? 'perf-data/results.jsonl'
const reportFile = process.env.PERF_REPORT ?? 'perf-data/README.md'
// how many runs the charts show: about three months of weekly runs
const chartRuns = 12

if (!existsSync(resultsFile)) {
  console.error(`no ${resultsFile} yet; run pnpm perf first`)
  process.exit(1)
}
const allRuns = readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const latest = allRuns.at(-1)
// only runs from the same place and site are comparable (see `where` in measure.js)
const runs = allRuns.filter(run => run.where === latest.where && run.site === latest.site)
const previous = runs.at(-2)

// lower is better for every metric. a change counts only past both limits: two identical runs minutes apart (6 Nov
// 2026, from india) moved 15-20% on timings and doubled the api's typical round trip, and a few milliseconds on a fast
// page is a big percentage of nothing. tighten these once a few months of weekly runs show the real spread
const metrics = [
  { key: 'ttfb', name: 'Time to first byte', unit: 'ms', noise: 50 },
  { key: 'lcp', name: 'Largest contentful paint', unit: 'ms', noise: 150 },
  { key: 'load', name: 'Page fully loaded', unit: 'ms', noise: 150 },
  { key: 'cls', name: 'Layout shift', unit: '', noise: 0.01, worse: 'jumpier', better: 'steadier' },
  { key: 'kb', name: 'Downloaded', unit: 'KB', noise: 2, worse: 'bigger', better: 'smaller' },
]
const NOISE_PERCENT = 25

const views = [
  { profile: 'desktop', page: 'home', label: 'Desktop · home page' },
  { profile: 'desktop', page: 'sign-in', label: 'Desktop · sign-in page' },
  { profile: 'phone', page: 'home', label: 'Phone on slow 4G · home page' },
  { profile: 'phone', page: 'sign-in', label: 'Phone on slow 4G · sign-in page' },
]

const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortDay = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const show = (value, unit) => value === undefined ? '—' : unit === '' ? value.toFixed(3) : `${Math.round(value).toLocaleString('en-GB')} ${unit}`

function change(before, after, noise, worse = 'slower', better = 'faster') {
  if (before === undefined || after === undefined) return '—'
  const delta = after - before
  const percent = before === 0 ? (delta === 0 ? 0 : 100) : delta / before * 100
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  const text = `${sign}${Math.abs(percent).toFixed(0)}%`
  if (Math.abs(delta) < noise || Math.abs(percent) < NOISE_PERCENT) return `⚪ ${text}`
  return delta > 0 ? `🔴 **${text}** ${worse}` : `🟢 **${text}** ${better}`
}

function row(label, name, before, after, unit, noise, worse, better) {
  return `| ${label} | ${name} | ${show(before, unit)} | ${show(after, unit)} | ${change(before, after, noise, worse, better)} |`
}

// a mermaid line chart (github draws it); one series per chart, since mermaid's xychart has no legend
function chart(title, unit, pick) {
  const shown = runs.slice(-chartRuns)
  const values = shown.map(pick).map(value => Math.round(value ?? 0))
  return [
    '```mermaid',
    'xychart-beta',
    `  title "${title}"`,
    `  x-axis [${shown.map(run => `"${shortDay(run.date)}"`).join(', ')}]`,
    `  y-axis "${unit}" 0 --> ${Math.ceil(Math.max(...values, 1) * 1.2)}`,
    `  line [${values.join(', ')}]`,
    '```',
  ].join('\n')
}

const lines = [
  '# CKAuth real-world performance',
  '',
  `Measured every week from **${latest.where}** against ${latest.site}, by \`scripts/perf/measure.js\` on \`main\`.`,
  `Each number is the median of ${latest.samples} cold page loads in Chromium (no cache, new connections). Lower is better.`,
  '',
  `**Latest run:** ${day(latest.date)}${previous ? ` · compared with ${day(previous.date)}` : ' · the first run, so this is the baseline'}`,
  '',
  '## Latest run against the previous one',
  '',
  '| Where | Metric | Previous run | Latest run | Change |',
  '|---|---|--:|--:|---|',
]

for (const view of views) {
  for (const metric of metrics) {
    const before = previous?.pages[view.profile]?.[view.page]?.[metric.key]
    const after = latest.pages[view.profile]?.[view.page]?.[metric.key]
    lines.push(row(view.label, metric.name, before, after, metric.unit, metric.noise, metric.worse, metric.better))
  }
}
lines.push(row('API (`GET /api/`)', 'Round trip, typical', previous?.api.median, latest.api.median, 'ms', 40))
lines.push(row('API (`GET /api/`)', 'Round trip, slowest 5%', previous?.api.p95, latest.api.p95, 'ms', 60))

lines.push(
  '',
  `🟢 faster · 🔴 slower · ⚪ within normal noise (under ${NOISE_PERCENT}%, or only a few ms)`,
  '',
  '## Trend',
  '',
  chart('Home page, desktop: time to first byte (ms)', 'ms', run => run.pages.desktop?.home?.ttfb),
  '',
  chart('Home page, desktop: largest contentful paint (ms)', 'ms', run => run.pages.desktop?.home?.lcp),
  '',
  chart('Home page, phone on slow 4G: largest contentful paint (ms)', 'ms', run => run.pages.phone?.home?.lcp),
  '',
  chart('Sign-in page, phone on slow 4G: largest contentful paint (ms)', 'ms', run => run.pages.phone?.['sign-in']?.lcp),
  '',
  chart('API round trip, typical (ms)', 'ms', run => run.api.median),
  '',
  '## What the metrics mean',
  '',
  '- **Time to first byte (TTFB):** from clicking to the first byte of the page arriving: DNS lookup, connection and TLS handshake, the edge proxy and the server. Mostly distance; a jump here is the server or the network.',
  '- **Largest contentful paint (LCP):** when the biggest thing on screen (usually the headline) appears. Google counts under 2,500 ms as good.',
  '- **Page fully loaded:** when the browser\'s load event finishes (every script, style and font).',
  '- **Layout shift (CLS):** how much the page jumps while loading. Under 0.1 is good; 0 means nothing moves.',
  '- **Downloaded:** everything the page fetched, compressed. A jump here is usually a bigger JavaScript bundle.',
  '- **API round trip:** `GET /api/` from inside a loaded page on a warm connection: network there and back, plus the edge proxy and Express.',
  '- **Phone on slow 4G:** a 1.6 Mbit/s connection and a CPU 4× slower than the runner\'s (Lighthouse\'s mobile preset). Chrome adds latency once per request, so it is gentler on TTFB than a real slow network.',
  '',
  '<details><summary>Every run</summary>',
  '',
  '| Date | Desktop TTFB | Desktop LCP | Phone LCP | Phone sign-in LCP | Home KB | API typical |',
  '|---|--:|--:|--:|--:|--:|--:|',
  ...runs.slice().reverse().map(run => `| ${day(run.date)} | ${show(run.pages.desktop?.home?.ttfb, 'ms')} | ${show(run.pages.desktop?.home?.lcp, 'ms')} | ${show(run.pages.phone?.home?.lcp, 'ms')} | ${show(run.pages.phone?.['sign-in']?.lcp, 'ms')} | ${show(run.pages.desktop?.home?.kb, 'KB')} | ${show(run.api.median, 'ms')} |`),
  '',
  '</details>',
  '',
)

const report = lines.join('\n')
writeFileSync(reportFile, report)
console.log(report)
