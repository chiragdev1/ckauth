// bundles the markdown docs into one self-contained page, published as the "CKAuth Docs" artifact.
// run `pnpm docs:artifact`, then republish .docs-artifact/ckauth-docs.html (see CLAUDE.md, Workflow)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { slugify } from './slug.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outFile = join(root, '.docs-artifact', 'ckauth-docs.html')
const repoUrl = 'https://github.com/chiragdev1/ckauth'

// sidebar order; `key` is the page's #anchor, so keep keys stable once shared
const docs = [
  { key: 'readme', path: 'README.md', title: 'Overview', group: 'Start here', blurb: 'What CKAuth is, setup and scripts' },
  { key: 'api', path: 'docs/API.md', title: 'API reference', group: 'Build', blurb: 'Every endpoint, payload and error' },
  { key: 'conventions', path: 'CLAUDE.md', title: 'Conventions', group: 'Build', blurb: 'Where things live, code style and security rules' },
  { key: 'deployment', path: 'docs/DEPLOYMENT.md', title: 'Deployment', group: 'Run', blurb: 'From an empty VPS to live, plus operations' },
  { key: 'vps-access', path: 'docs/VPS-ACCESS.md', title: 'VPS access', group: 'Run', blurb: 'SSH keys, GitHub and the deploy user' },
  { key: 'glossary', path: 'docs/GLOSSARY.md', title: 'Glossary', group: 'Reference', blurb: 'Every term the docs use' },
  { key: 'brand', path: 'docs/BRAND.md', title: 'Brand guide', group: 'Reference', blurb: 'Name, crest, colours, voice and brand files' },
  { key: 'seo-audit', path: 'docs/SEO-AUDIT.md', title: 'SEO audit', group: 'Reference', blurb: '64 strict tests and the traffic plan' },
  { key: 'devlog', path: 'DEVLOG.md', title: 'Dev log', group: 'Journey', blurb: 'What changed, and when' },
  { key: 'roadmap', path: 'ROADMAP.md', title: 'Roadmap', group: 'Journey', blurb: 'Next up, then the bigger directions' },
  { key: 'learnings', path: 'LEARNINGS.md', title: 'Learnings', group: 'Journey', blurb: 'Mistakes and the rules they taught' },
]

// plans and reports that live as their own artifacts
const links = [
  { title: 'OpenID Connect plan', url: 'https://claude.ai/artifact/MxN3STxRZL6EYgWA1rVWBC', note: 'Provider role + Google/GitHub sign-in' },
  { title: 'SEO audit, interactive', url: 'https://claude.ai/artifact/MQQ63c5zJywVQqwcsCznbF', note: 'The 21 Oct audit as a page' },
]

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function plainText(markdown) {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/\*\*?/g, '')
}

// headings and links outside fenced code, so examples inside code blocks don't count
function scan(markdown) {
  const headings = []
  const hrefs = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/)
    if (heading) headings.push(plainText(heading[1]))
    const withoutCode = line.replace(/`[^`]*`/g, '')
    for (const match of withoutCode.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      if (!match[1]) hrefs.push(match[2])
    }
  }
  return { headings, hrefs }
}

// same de-duplication as github and the page: a repeated heading gets -1, -2…
function anchorsOf(headings) {
  const seen = new Map()
  return new Set(headings.map(heading => {
    const base = slugify(heading)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}-${count}` : base
  }))
}

function findBrokenLinks(loaded) {
  const byPath = new Map(loaded.map(doc => [doc.path, doc]))
  const problems = []
  for (const doc of loaded) {
    for (const href of doc.hrefs) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue
      const [rawPath, anchor] = href.split('#')
      const target = rawPath ? posix.normalize(posix.join(posix.dirname(doc.path), decodeURIComponent(rawPath))) : doc.path
      const targetDoc = byPath.get(target)
      if (targetDoc) {
        if (anchor && !targetDoc.anchors.has(anchor)) problems.push(`${doc.path}: ${href} → ${target} has no heading #${anchor}`)
      } else if (!existsSync(join(root, target))) {
        problems.push(`${doc.path}: ${href} → ${target} doesn't exist`)
      }
    }
  }
  return problems
}

// every problem is printed; with DOCS_STRICT=1 (set by pnpm check:pr) they also fail the build, so a PR can't add a broken link.
// without it they only warn, so a typo in one heading doesn't block republishing the page. exitCode rather than exit(),
// so the page is still written and can be looked at
function reportBrokenLinks(problems) {
  for (const problem of problems) console.warn(`broken link: ${problem}`)
  if (problems.length > 0 && process.env.DOCS_STRICT === '1') {
    console.error(`${problems.length} broken link${problems.length === 1 ? '' : 's'} between docs (DOCS_STRICT=1)`)
    process.exitCode = 1
  }
}

const loaded = docs.map(doc => {
  const markdown = readFileSync(join(root, doc.path), 'utf8')
  const { headings, hrefs } = scan(markdown)
  return { ...doc, markdown, hrefs, anchors: anchorsOf(headings) }
})

reportBrokenLinks(findBrokenLinks(loaded))

const data = {
  repoUrl,
  commit: git('rev-parse', 'HEAD'),
  commitDate: git('log', '-1', '--format=%cI'),
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  uncommitted: git('status', '--porcelain').length > 0,
  builtAt: new Date().toISOString(),
  docs: loaded.map(({ key, path, title, group, blurb, markdown }) => ({ key, path, title, group, blurb, markdown })),
  links,
}

// "<" escaped so a doc that mentions </script> can't end the data block early
const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
const page = readFileSync(join(here, 'template.html'), 'utf8')
  .replace('/*__SLUGIFY__*/', () => slugify.toString())
  .replace('__DOCS_DATA__', () => json)

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, page)
console.log(`wrote ${posix.relative(root.split('\\').join('/'), outFile.split('\\').join('/'))} (${Math.round(page.length / 1024)} KiB, ${docs.length} docs, commit ${data.commit.slice(0, 7)}${data.uncommitted ? ' + uncommitted changes' : ''})`)

// when to republish the page, decided by what changed rather than by the calendar. publishing happens through claude.ai,
// which this script can't see, so `--published` records it: the date in published.json and a copy of every doc's
// markdown in published-docs.json (both local, gitignored). each build compares against that copy:
// - nothing changed: up to date, nothing to do
// - a contract doc changed (what other developers build against): republish now, a wrong contract misleads them
// - anything else changed: republish once REPUBLISH_GAP_DAYS have passed, so small edits batch into one publish
const REPUBLISH_GAP_DAYS = 3
const CONTRACT_DOCS = ['README.md', 'docs/API.md']
const stampFile = join(root, '.docs-artifact', 'published.json')
const snapshotFile = join(root, '.docs-artifact', 'published-docs.json')
// local dates (YYYY-MM-DD), not UTC: a publish at 1:30 am in India is still that day's publish
const day = date => date.toLocaleDateString('en-CA')
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
let published = readJson(stampFile)?.published ?? []
const current = Object.fromEntries(data.docs.map(doc => [doc.path, doc.markdown]))
if (process.argv.includes('--published')) {
  published = [...published, day(new Date())].slice(-20)
  writeFileSync(stampFile, `${JSON.stringify({ published }, null, 2)}\n`)
  writeFileSync(snapshotFile, JSON.stringify(current))
}
// lines added and removed, counted as multisets: close enough to a real diff to size a change, and needs no library
const lineChanges = (before = '', after = '') => {
  const count = new Map()
  for (const line of before.split('\n')) count.set(line, (count.get(line) ?? 0) + 1)
  let added = 0
  for (const line of after.split('\n')) {
    if (count.get(line) > 0) count.set(line, count.get(line) - 1)
    else added++
  }
  return { added, removed: [...count.values()].reduce((sum, left) => sum + left, 0) }
}
const last = published.at(-1)
const snapshot = readJson(snapshotFile)
if (!last || !snapshot) {
  console.log('docs page: no publish recorded; after publishing, run `pnpm docs:artifact --published`')
} else {
  const changed = Object.keys({ ...snapshot, ...current }).filter(path => snapshot[path] !== current[path])
  if (!changed.length) {
    console.log(`docs page: up to date (published ${last}, nothing changed since)`)
  } else {
    const sizes = changed.map(path => ({ path, ...lineChanges(snapshot[path], current[path]) }))
    const added = sizes.reduce((sum, size) => sum + size.added, 0)
    const removed = sizes.reduce((sum, size) => sum + size.removed, 0)
    const dueDate = new Date(`${last}T00:00:00`)
    dueDate.setDate(dueDate.getDate() + REPUBLISH_GAP_DAYS)
    const due = day(dueDate)
    const contract = changed.filter(path => CONTRACT_DOCS.includes(path))
    const verdict = contract.length ? `republish now: ${contract.join(' and ')} changed` : due <= day(new Date()) ? 'republish now' : `republish due ${due}`
    console.log(`docs page: ${verdict} (published ${last}; ${changed.length} of ${data.docs.length} docs changed since, +${added} -${removed} lines)`)
    for (const size of sizes) console.log(`  ${size.path}: +${size.added} -${size.removed}`)
  }
}
