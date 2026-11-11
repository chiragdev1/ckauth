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
  { key: 'conventions', path: 'CLAUDE.md', title: 'Conventions', group: 'Build', blurb: 'Layout, code style and security rules' },
  { key: 'deployment', path: 'docs/DEPLOYMENT.md', title: 'Deployment', group: 'Run', blurb: 'From an empty VPS to live, plus operations' },
  { key: 'vps-access', path: 'docs/VPS-ACCESS.md', title: 'VPS access', group: 'Run', blurb: 'SSH keys, GitHub and the deploy user' },
  { key: 'oidc', path: 'docs/OIDC.md', title: 'Sign in with CKAuth', group: 'Build', blurb: 'The OpenID Connect design, from analogy to security rules' },
  { key: 'glossary', path: 'docs/GLOSSARY.md', title: 'Glossary', group: 'Reference', blurb: 'Every term the docs use' },
  { key: 'brand', path: 'docs/BRAND.md', title: 'Brand guide', group: 'Reference', blurb: 'Name, crest, colours, voice and brand files' },
  { key: 'seo-audit', path: 'docs/SEO-AUDIT.md', title: 'SEO audit', group: 'Reference', blurb: '64 strict tests and the traffic plan' },
  { key: 'market', path: 'docs/MARKET.md', title: 'Market review', group: 'Reference', blurb: 'Rating, competitors, pricing and go-to-market' },
  { key: 'devlog', path: 'DEVLOG.md', title: 'Dev log', group: 'Journey', blurb: 'What changed, and when' },
  { key: 'learnings', path: 'LEARNINGS.md', title: 'Learnings', group: 'Journey', blurb: 'Mistakes and the rules they taught' },
]

// plans and reports that live as their own artifacts
const links = [
  { title: 'OpenID Connect plan', url: 'https://claude.ai/artifact/MxN3STxRZL6EYgWA1rVWBC', note: 'Sign in with CKAuth: flow, tokens, 33 rules' },
  { title: 'SEO audit, interactive', url: 'https://claude.ai/artifact/MQQ63c5zJywVQqwcsCznbF', note: 'The 21 Oct audit, fixes to 7 Nov' },
  { title: 'Market review', url: 'https://claude.ai/artifact/6vDs2y172qiJSbz8nXnmRx', note: 'Rating, competitors, pricing, go-to-market' },
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
