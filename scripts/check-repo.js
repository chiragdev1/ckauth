// repo-wide pre-PR rules that no compiler checks: secrets, the security rules in CLAUDE.md, files that must change together.
// run by scripts/check-pr.js; compares the branch with origin/main (main if there's no remote). exits 1 on any failure; warnings don't fail
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const failures = []
const warnings = []
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

// origin/main when it exists: a local main nobody has pulled lags behind and makes merged work look like this branch's
const hasOriginMain = (() => { try { git('rev-parse', '--verify', '--quiet', 'origin/main'); return true } catch { return false } })()
const base = git('merge-base', 'HEAD', hasOriginMain ? 'origin/main' : 'main').trim()
// committed and uncommitted changes, so it works before and after the last commit
const changed = new Set([...git('diff', '--name-only', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))
const changedUnder = prefix => [...changed].some(file => file.startsWith(prefix))
const tracked = git('ls-files').split('\n').filter(Boolean)

// secrets: the shapes of the keys this project uses, plus the usual suspects. only added lines are checked
const secretPatterns = [
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/, 'Resend API key'],
  [/\bprivate_[A-Za-z0-9+/=]{20,}/, 'ImageKit private key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/postgres(ql)?:\/\/[^:\s]+:(?!postgres@)[^@\s]{6,}@(?!localhost|db[:/])/, 'database URL with a real password'],
]
const added = git('diff', base, '--unified=0', '--no-color').split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
for(const line of added) {
  for(const [pattern, name] of secretPatterns) {
    if(pattern.test(line)) failures.push(`possible ${name} added: ${line.slice(0, 80)}`)
  }
}
for(const file of tracked) {
  if(/(^|\/)\.env$|\.env\.(?!sample$)[^/]*$/.test(file)) failures.push(`${file} is tracked; env files hold secrets`)
}

// the security rules in CLAUDE.md that a grep can enforce
const apiSources = tracked.filter(file => file.startsWith('src/') && file.endsWith('.ts'))
for(const file of apiSources) {
  const source = readFileSync(file, 'utf8')
  if(source.includes('bcryptjs')) failures.push(`${file}: use native bcrypt, never bcryptjs`)
  // the api logs through pino (req.log / logger) so every line is JSON with a request id; only the CLIs print
  const mayPrint = file.startsWith('src/scripts/') || file === 'src/db/migrate.ts'
  source.split('\n').forEach((line, index) => {
    if(!mayPrint && /\bconsole\.\w+\(/.test(line)) {
      failures.push(`${file}:${index + 1}: log with req.log or logger (src/utils/logger.ts), never console (CLAUDE.md → Logging)`)
    }
    if(/console\.\w+\(.*\b(password|newPassword|currentPassword|token|refreshToken|accessToken|secret)\b\s*[,)}]/.test(line)) {
      failures.push(`${file}:${index + 1}: logs a password, token or secret`)
    }
    if(file.includes('controller') && /res\.status\(\s*[45]\d\d\s*\)\.json\(/.test(line)) {
      failures.push(`${file}:${index + 1}: errors are thrown as ApiError, not sent with res.status().json()`)
    }
  })
}

// a committed file may only link to committed files: a link to an ignored, local-only doc works on this machine and
// is broken for everyone who clones the repo (and names a file meant to stay private). the docs bundle's list counts too
// "committed" means tracked, or new and not ignored (it will be committed with the change); ignored files are the
// local-only ones (.gitignore and .git/info/exclude)
const committable = [...tracked, ...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)]
const committableSet = new Set(committable)
const isTracked = target => committableSet.has(target) || committable.some(file => file.startsWith(`${target.replace(/\/$/, '')}/`))
for(const file of committable.filter(name => name.endsWith('.md'))) {
  // fenced code blocks hold examples, not links
  const prose = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '')
  for(const match of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0]
    if(!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target)))
    if(!isTracked(resolved)) failures.push(`${file}: links to ${target}, which isn't committed (local-only or missing)`)
  }
  // naming one in backticks leaks it too. only a path that exists here but isn't committed counts, so an example name
  // like `<name>.md` or a doc still to be written doesn't trip it
  for(const match of prose.matchAll(/`([\w./-]+\.md)`/g)) {
    const candidates = [match[1], path.posix.join(path.posix.dirname(file), match[1])].map(candidate => path.posix.normalize(candidate))
    if(candidates.some(candidate => existsSync(candidate) && !isTracked(candidate))) {
      failures.push(`${file}: names ${match[1]}, a local-only file (keep local docs out of committed files)`)
    }
  }
}
for(const match of readFileSync('scripts/docs-artifact/build.js', 'utf8').matchAll(/\bpath: '([^']+)'/g)) {
  if(!isTracked(match[1])) failures.push(`scripts/docs-artifact/build.js: bundles ${match[1]}, which isn't committed (local-only docs go in local-docs.json)`)
}

// docs/API.md's rate-limit table must say what the code does: the same endpoints, limits, windows, keys and
// failures-only counting. the code side is rebuilt from rate-limit.ts and every routes.ts, mounted as src/app/index.ts says
const limiterSource = readFileSync('src/app/middlewares/rate-limit.ts', 'utf8')
const windows = { 'MINUTE': 'minute', '15 * MINUTE': '15 min', 'HOUR': 'hour' }
const keyKinds = { ipKey: 'ip', emailKey: 'email', userKey: 'user' }
const limiters = new Map([...limiterSource.matchAll(/^\s+(\w+): createRateLimiter\(\{([^}]*)\}\)/gm)].map(([, name, options]) => [name, {
  window: windows[options.match(/windowMs: ([^,]+)/)?.[1].trim()] ?? `unknown window in ${name}`,
  limit: Number(options.match(/limit: (\d+)/)?.[1]),
  key: keyKinds[options.match(/key: (\w+)/)?.[1] ?? 'ipKey'],
  failuresOnly: /failuresOnly: true/.test(options),
}]))
const mounts = Object.fromEntries([...readFileSync('src/app/index.ts', 'utf8').matchAll(/app\.use\('(\/[\w.-]+)', (\w+)\)/g)].map(([, prefix, router]) => [router, prefix]))
const describeLimit = ({window, limit, key, failuresOnly}) => `${limit}/${window}/${key}${failuresOnly ? '/failures' : ''}`
const codeLimits = new Set()
let limiterUses = 0
let limiterUsesRead = 0
for(const file of tracked.filter(name => /^src\/app\/[^/]+\/routes\.ts$/.test(name))) {
  limiterUses += (readFileSync(file, 'utf8').match(/rateLimits\.\w+/g) ?? []).length
  for(const [, router, method, route, middleware] of readFileSync(file, 'utf8').matchAll(/^(\w+)\.(get|post|patch|put|delete)\('([^']+)', (.*)$/gm)) {
    for(const [, name] of middleware.matchAll(/rateLimits\.(\w+)/g)) {
      limiterUsesRead++
      const limiter = limiters.get(name)
      if(!limiter) { failures.push(`${file}: rateLimits.${name} isn't defined in rate-limit.ts`); continue }
      codeLimits.add(`${method.toUpperCase()} ${mounts[router] ?? `(unmounted ${router})`}${route} ${describeLimit(limiter)}`)
    }
  }
}
const apiDoc = readFileSync('docs/API.md', 'utf8')
const docLimits = new Set()
for(const [, endpoints, limitText, perText] of apiDoc.slice(apiDoc.indexOf('### Rate limits'), apiDoc.indexOf('\n---', apiDoc.indexOf('### Rate limits'))).matchAll(/^\| ((?:`[A-Z]+ \/[^`]+`(?: and )?)+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
  const window = limitText.match(/per (15 min|hour|minute)/)?.[1] ?? `unparsed "${limitText.trim()}"`
  const key = /^IP/.test(perText) ? 'ip' : /^Email/.test(perText) ? 'email' : /^Signed-in/.test(perText) ? 'user' : `unparsed "${perText.trim()}"`
  const limit = { window, limit: Number(limitText.match(/^(\d+)/)?.[1]), key, failuresOnly: /failed|wrong password/.test(limitText) }
  for(const [, endpoint] of endpoints.matchAll(/`([A-Z]+ \/[^`]+)`/g)) docLimits.add(`${endpoint} ${describeLimit(limit)}`)
}
// a limiter on a route split over lines, or applied with router.use, would otherwise be skipped silently
if(limiterUses !== limiterUsesRead) failures.push(`routes.ts files use rateLimits ${limiterUses} times but the rate-limit check read ${limiterUsesRead}: keep each limited route on one line as router.<method>('path', …)`)
// an empty side means a parser stopped matching (a renamed heading, a reformatted call), not that all is well
if(!codeLimits.size || !docLimits.size) failures.push(`rate-limit check read ${codeLimits.size} limits from the code and ${docLimits.size} from docs/API.md: a parser no longer matches`)
for(const entry of codeLimits) if(!docLimits.has(entry)) failures.push(`docs/API.md rate-limit table is missing or wrong for: ${entry} (limit/window/key from the code)`)
for(const entry of docLimits) if(!codeLimits.has(entry)) failures.push(`docs/API.md rate-limit table lists ${entry}, which the code doesn't have`)

// the web Caddyfile's @app list must match the routes in app.tsx, or a route gets a 404 (or a noindex goes missing)
// /dev/… pages are development only (frontend/scripts/check-dist.js fails a build that ships one), so caddy never serves them
const routes = [...readFileSync('frontend/src/app.tsx', 'utf8').matchAll(/path: '(\/[^']+)'/g)].map(match => match[1]).filter(route => !route.startsWith('/dev/')).sort()
const caddyLine = readFileSync('frontend/Caddyfile', 'utf8').match(/@app path ([^\n]+)/)
const caddyRoutes = (caddyLine?.[1] ?? '').split(/\s+/).filter(path => path && path !== '/app.html').sort()
if(routes.join(' ') !== caddyRoutes.join(' ')) {
  failures.push(`frontend/Caddyfile @app (${caddyRoutes.join(' ')}) doesn't match app.tsx routes (${routes.join(' ')})`)
}

// the api connects as ckauth_api, never as the owner (CLAUDE.md → Deploys): the owner can edit and delete the activity log
// and drop its triggers. the api service's block runs from "  api:" to the next service at the same indent
const composeFile = readFileSync('deploy/compose.yml', 'utf8')
const apiService = composeFile.match(/\n  api:\n([\s\S]*?)(?=\n  [a-z][\w-]*:\n)/)?.[1] ?? ''
const apiDatabaseUrl = apiService.match(/DATABASE_URL:\s*(\S+)/)?.[1] ?? ''
if(!/^postgres(ql)?:\/\/ckauth_api:/.test(apiDatabaseUrl)) {
  failures.push(`deploy/compose.yml: the api service must connect as ckauth_api, not ${apiDatabaseUrl.split(':')[1]?.replace('//', '') || 'nothing'} (CLAUDE.md, least privilege)`)
}

// files that must change together (CLAUDE.md → Workflow)
if(changed.has('src/db/schema.ts') && !changedUnder('drizzle/')) failures.push('schema.ts changed without a migration in drizzle/')
if((changedUnder('src/') || changedUnder('frontend/src/')) && !changed.has('DEVLOG.md')) warnings.push('code changed but DEVLOG.md did not')
if([...changed].some(file => /^src\/app\/[^/]+\/(routes|models)\.ts$/.test(file)) && !changed.has('docs/API.md')) {
  warnings.push('routes or models changed but docs/API.md did not')
}
const featureTouched = [...changed].some(file => file.startsWith('frontend/src/pages/') || /^src\/app\/[^/]+\/routes\.ts$/.test(file))
if(featureTouched && !changed.has('frontend/index.html')) warnings.push('a page or endpoint changed: does the search title/description still match? (frontend/index.html)')

for(const warning of warnings) console.log(`  warn  ${warning}`)
for(const failure of failures) console.log(`  FAIL  ${failure}`)
console.log(`repo checks: ${failures.length} failed, ${warnings.length} warnings (${changed.size} files changed since main)`)
process.exit(failures.length ? 1 : 0)
