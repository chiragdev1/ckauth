// pnpm test:only <file …>: run some test files the safe way, e.g. `pnpm test:only session sign-in`.
// running a file directly (`tsx --test test/x.test.ts`) skips test/env.ts: mail is no longer in memory (real Resend
// sends), the real secrets load, and the test setup wipes whatever database DATABASE_URL names, the dev one included.
// so this takes the exact `pnpm test` command from package.json and swaps only its file list: the env, the separate
// ckauth_test database and the reporter can't drift apart. not a gate: pnpm check:pr and CI still run every file,
// with coverage (a subset's coverage means nothing, so it isn't measured here)
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ALL_FILES = "'test/**/*.test.ts'"
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
if(!scripts.test.endsWith(ALL_FILES)) throw new Error(`test-only: package.json's "test" script no longer ends with ${ALL_FILES}; update scripts/test-only.js`)

const names = process.argv.slice(2)
if(!names.length) {
  console.error('usage: pnpm test:only <file …>   e.g. pnpm test:only session sign-in   (pnpm test runs them all)')
  process.exit(2)
}
// "session", "session.test.ts" or "test/session.test.ts" all mean test/session.test.ts. only plain names inside test/,
// so nothing else can be run through here and nothing reaches the shell but a checked path
const files = names.map(name => `test/${name.replace(/^test\//, '').replace(/\.test\.ts$/, '')}.test.ts`)
const bad = files.filter(file => !/^test\/[\w-]+\.test\.ts$/.test(file) || !existsSync(file))
if(bad.length) {
  console.error(`test-only: no such test file: ${bad.join(', ')}`)
  process.exit(2)
}

const command = `${scripts.test.slice(0, -ALL_FILES.length)}${files.join(' ')}`
const result = spawnSync(command, { shell: true, stdio: 'inherit' })
process.exit(result.status ?? 1)
