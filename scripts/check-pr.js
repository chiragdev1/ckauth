// every check a branch must pass before a PR: `pnpm check:pr`. runs them all (one failure doesn't hide the next),
// prints the output of the ones that failed, and exits 1 if any did. when a new rule is added to CLAUDE.md, add its check here,
// and prove it fails once on a broken input. the detailed rules live in scripts/check-repo.js and frontend/scripts/check-dist.js
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// a command that passes when it exits 0
function command(cmd, args, options = {}) {
  return () => {
    const result = spawnSync(cmd, args, { cwd: join(root, options.cwd ?? '.'), encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', ...options.env } })
    return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}` }
  }
}

// a Learn by Doing placeholder left in the code means a piece of it was never written
function noTodoHuman() {
  const marker = ['TODO', '(human)'].join('')
  // code only: the docs mention the marker by name
  const result = spawnSync('git', ['grep', '-n', '-I', '--untracked', '-F', marker, '--', '*.ts', '*.tsx', '*.js', '*.css', '*.html'], { cwd: root, encoding: 'utf8' })
  // git grep exits 1 when nothing matches, which is the passing case
  return { ok: result.status === 1, output: result.stdout || result.stderr }
}

// order matters only where a step reads another's output: the dist checks read the frontend build
const checks = [
  { name: 'api: type check and build', run: command('pnpm', ['build']) },
  { name: 'api: unused files, exports and dependencies (knip)', run: command('pnpm', ['exec', 'knip', '--no-progress']) },
  { name: 'api: known vulnerabilities', run: command('pnpm', ['audit', '--prod', '--audit-level', 'moderate']) },
  { name: 'tests: type check', run: command('pnpm', ['test:types']) },
  { name: 'tests and coverage (need Postgres: pnpm db:up)', run: command('pnpm', ['test:coverage']) },
  { name: 'web: type check, build and prerender', run: command('pnpm', ['build'], { cwd: 'frontend' }) },
  { name: 'web: unit tests and their type check', run: () => {
    const types = command('pnpm', ['test:types'], { cwd: 'frontend' })()
    return types.ok ? command('pnpm', ['test'], { cwd: 'frontend' })() : types
  } },
  { name: 'web: unused files, exports and dependencies (knip)', run: command('pnpm', ['exec', 'knip', '--no-progress'], { cwd: 'frontend' }) },
  { name: 'web: known vulnerabilities', run: command('pnpm', ['audit', '--prod', '--audit-level', 'moderate'], { cwd: 'frontend' }) },
  { name: 'web: seo, speed and security of the build', run: command('node', ['frontend/scripts/check-dist.js']) },
  { name: 'repo: secrets, security rules, Caddyfile routes, files that change together', run: command('node', ['scripts/check-repo.js']) },
  // strict: a broken link between docs fails here, though `pnpm docs:artifact` alone only warns
  { name: 'docs: build and links', run: command('node', ['scripts/docs-artifact/build.js'], { env: { DOCS_STRICT: '1' } }) },
  { name: 'no Learn by Doing placeholders left', run: noTodoHuman },
]

const failed = []
for (const check of checks) {
  const started = Date.now()
  // in a terminal, show what's running and overwrite it with the result; piped (CI), print only the result
  if (process.stdout.isTTY) process.stdout.write(`… ${check.name}`)
  const { ok, output } = check.run()
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  process.stdout.write(`${process.stdout.isTTY ? '\r' : ''}${ok ? '✓' : '✗'} ${check.name} (${seconds}s)\n`)
  if (!ok) failed.push({ ...check, output })
}

for (const { name, output } of failed) {
  // the end of the output is where the error is; long test logs would bury it
  const lines = output.trim().split('\n')
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
  if (lines.length > 60) console.log(`… (${lines.length - 60} earlier lines hidden)`)
  console.log(lines.slice(-60).join('\n'))
}

console.log(failed.length ? `\n${failed.length} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`)
process.exitCode = failed.length ? 1 : 0
