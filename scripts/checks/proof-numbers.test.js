import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import { checkProofNumbers, readClaims } from './proof-numbers.js'

const copy = (tests, lines, verified = '25 Nov 2026') => `export const proofNumbers = { tests: ${tests}, linesCovered: ${lines}, verified: '${verified}' }`
const run = (passed, lines) => `stderr: …\n✔ ${passed} passed, 0 failed, 0 cancelled, 0 skipped, 2 todo, of ${passed + 2} tests in 55.4s · coverage: lines ${lines}%, branches 89.8%, functions 88.1%\n`
const today = new Date(2026, 10, 26)
const check = (copySource, testOutput, when = today) => checkProofNumbers({ copySource, testOutput, today: when })

describe('proof numbers', () => {
  test('rounded down and recent passes', () => {
    assert.deepEqual(check(copy(270, 96), run(272, 96.1)), [])
  })

  test('a claim above what was measured fails: never round up', () => {
    assert.match(check(copy(280, 96), run(272, 96.1))[0], /claims 280 tests.*measured 272.*Never round up/)
    assert.match(check(copy(270, 97), run(272, 96.1))[0], /claims 97 % of lines/)
  })

  test('a claim more than 10% below what was measured is stale', () => {
    assert.match(check(copy(240, 96), run(272, 96.1))[0], /Update proofNumbers/)
  })

  test('a verified date over 45 days old, in the future, or unreadable fails', () => {
    assert.match(check(copy(270, 96), run(272, 96.1), new Date(2027, 0, 20))[0], /days old/)
    assert.match(check(copy(270, 96, '30 Nov 2026'), run(272, 96.1))[0], /future/)
    assert.match(check(copy(270, 96, '2026-11-25'), run(272, 96.1))[0], /must read like/)
  })

  test('a failing run, or output the parser no longer reads, fails instead of passing silently', () => {
    assert.match(check(copy(270, 96), '✖ 271 passed, 1 failed · coverage: lines 96.1%')[0], /no "✔ N passed/)
    assert.match(check('export const somethingElse = {}', run(272, 96.1))[0], /proofNumbers not found/)
  })

  // the real copy, so a reformat of home-copy.ts that the parser can't read fails here, not quietly in check:pr
  test('reads the real home-copy.ts', () => {
    const claims = readClaims(readFileSync('frontend/src/pages/home-copy.ts', 'utf8'))
    assert.ok(claims && claims.tests > 0 && claims.linesCovered > 0 && claims.verified instanceof Date)
  })
})
