import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { checkBetaBadge } from './beta-badge.js'

const badge = ['frontend/src/components/beta-badge.tsx', 'export function BetaBadge() {}']
const consent = ['frontend/src/components/oauth-consent.tsx', "import { BetaBadge } from '@/components/beta-badge.tsx'\n<BetaBadge />"]
const devPage = ['frontend/src/pages/dev-oauth-consent.tsx', "import { ConsentScreen } from '@/components/oauth-consent.tsx'"]
const check = (...entries) => checkBetaBadge(new Map(entries))

describe('beta badge', () => {
  test('an OIDC component with the badge, and a page that wraps it, pass', () => {
    assert.deepEqual(check(badge, consent, devPage), [])
  })

  test('an OIDC page without the badge fails', () => {
    const bare = ['frontend/src/pages/oauth-error.tsx', "import { Card } from '@/components/ui/card.tsx'\n<Card />"]
    assert.match(check(badge, consent, bare)[0], /oauth-error\.tsx: an OIDC page must show the Beta badge/)
  })

  test('wrapping a non-OIDC component that happens to show the badge does not count', () => {
    const page = ['frontend/src/pages/oidc-apps.tsx', "import { Shell } from '@/components/shell.tsx'"]
    const shell = ['frontend/src/components/shell.tsx', "import { BetaBadge } from '@/components/beta-badge.tsx'\n<BetaBadge />"]
    const failures = check(badge, consent, page, shell)
    assert.ok(failures.some(failure => /shell\.tsx: imports the Beta badge/.test(failure)))
    assert.ok(failures.some(failure => /oidc-apps\.tsx: an OIDC page must show/.test(failure)))
  })

  test('the badge on a non-OIDC page fails', () => {
    const home = ['frontend/src/pages/home.tsx', "import { BetaBadge } from '@/components/beta-badge'\n<BetaBadge />"]
    assert.match(check(badge, consent, home)[0], /home\.tsx: imports the Beta badge/)
  })

  test('no OIDC files at all fails rather than passing silently', () => {
    assert.match(check(badge)[0], /no OIDC pages or components found/)
  })
})
