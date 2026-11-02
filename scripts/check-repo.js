// repo-wide pre-PR rules that no compiler checks: secrets, the security rules in CLAUDE.md, files that must change together.
// run by scripts/check-pr.js; compares the branch with main. exits 1 on any failure; warnings don't fail
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const failures = []
const warnings = []
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

const base = git('merge-base', 'HEAD', 'main').trim()
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
  source.split('\n').forEach((line, index) => {
    if(/console\.\w+\(.*\b(password|newPassword|currentPassword|token|refreshToken|accessToken|secret)\b\s*[,)}]/.test(line)) {
      failures.push(`${file}:${index + 1}: logs a password, token or secret`)
    }
    if(file.includes('controller') && /res\.status\(\s*[45]\d\d\s*\)\.json\(/.test(line)) {
      failures.push(`${file}:${index + 1}: errors are thrown as ApiError, not sent with res.status().json()`)
    }
  })
}

// the web Caddyfile's @app list must match the routes in app.tsx, or a route gets a 404 (or a noindex goes missing)
// /dev/… pages are development only (frontend/scripts/check-dist.js fails a build that ships one), so caddy never serves them
const routes = [...readFileSync('frontend/src/app.tsx', 'utf8').matchAll(/path: '(\/[^']+)'/g)].map(match => match[1]).filter(route => !route.startsWith('/dev/')).sort()
const caddyLine = readFileSync('frontend/Caddyfile', 'utf8').match(/@app path ([^\n]+)/)
const caddyRoutes = (caddyLine?.[1] ?? '').split(/\s+/).filter(path => path && path !== '/app.html').sort()
if(routes.join(' ') !== caddyRoutes.join(' ')) {
  failures.push(`frontend/Caddyfile @app (${caddyRoutes.join(' ')}) doesn't match app.tsx routes (${routes.join(' ')})`)
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
