import assert from 'node:assert/strict'
import { test } from 'node:test'

import { timeAgo } from '../src/lib/time.ts'

const now = new Date('2026-11-02T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

test('recent times read as words', () => {
  assert.equal(timeAgo(ago(20_000), now, 'en'), 'just now')
  assert.equal(timeAgo(ago(5 * 60_000), now, 'en'), '5 minutes ago')
  assert.equal(timeAgo(ago(3 * 60 * 60_000), now, 'en'), '3 hours ago')
  assert.equal(timeAgo(ago(26 * 60 * 60_000), now, 'en'), 'yesterday')
  assert.equal(timeAgo(ago(3 * 24 * 60 * 60_000), now, 'en'), '3 days ago')
})

test('a week or more shows the date instead', () => {
  assert.equal(timeAgo(ago(8 * 24 * 60 * 60_000), now, 'en'), 'Oct 25, 2026')
})
