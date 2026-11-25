// the home page's proof ledger states real numbers (frontend/src/pages/home-copy.ts, proofNumbers). a marketing number
// that overstates is a false claim, and one that lags is a missed sale, so pnpm check:pr compares them with the
// summary line of the test:coverage run it just did. the page may round down, never up.
// its own tests: proof-numbers.test.js

// how far below the measured value a claim may sit before it counts as stale
const MAX_LAG = 0.1
const MAX_AGE_DAYS = 45
const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

// the claims, read from the copy's source (it's TypeScript, so a regex rather than an import)
export function readClaims(copySource) {
  const block = copySource.match(/export const proofNumbers = \{([^}]*)\}/)?.[1]
  if(!block) return null
  const tests = Number(block.match(/tests:\s*(\d+)/)?.[1])
  const linesCovered = Number(block.match(/linesCovered:\s*(\d+)/)?.[1])
  const verified = block.match(/verified:\s*'(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})'/)
  return {
    tests, linesCovered,
    verified: verified ? new Date(Number(verified[3]), months[verified[2]] ?? NaN, Number(verified[1])) : null,
  }
}

// the measured values, from test/quiet-reporter.ts's summary: "✔ 272 passed, … · coverage: lines 96.1%, …"
export function readMeasured(testOutput) {
  const passed = testOutput.match(/✔ (\d+) passed, 0 failed/)?.[1]
  const lines = testOutput.match(/coverage: lines ([\d.]+)%/)?.[1]
  return passed && lines ? { tests: Number(passed), linesCovered: Number(lines) } : null
}

export function checkProofNumbers({ copySource, testOutput, today = new Date() }) {
  const claims = readClaims(copySource)
  const measured = readMeasured(testOutput)
  // a parser that stops matching must fail, or the check passes forever without checking
  if(!claims || Number.isNaN(claims.tests) || Number.isNaN(claims.linesCovered)) return ['proof numbers: proofNumbers not found in home-copy.ts, or a field is missing']
  if(!measured) return ['proof numbers: no "✔ N passed, 0 failed · coverage: lines X%" summary in the test output']

  const failures = []
  for(const [key, label] of [['tests', 'tests'], ['linesCovered', '% of lines covered']]) {
    const claim = claims[key]
    const actual = measured[key]
    if(claim > actual) failures.push(`proof numbers: the home page claims ${claim} ${label}, but the run measured ${actual}. Never round up`)
    else if(claim < actual * (1 - MAX_LAG)) failures.push(`proof numbers: the home page claims ${claim} ${label}, but the run measured ${actual}. Update proofNumbers in home-copy.ts`)
  }
  if(!claims.verified || Number.isNaN(claims.verified.getTime())) failures.push(`proof numbers: verified must read like '25 Nov 2026'`)
  else {
    const age = (today.getTime() - claims.verified.getTime()) / 86_400_000
    if(age < -1) failures.push('proof numbers: verified is in the future')
    else if(age > MAX_AGE_DAYS) failures.push(`proof numbers: verified is ${Math.floor(age)} days old (over ${MAX_AGE_DAYS}): re-check the ledger's claims and bump it`)
  }
  return failures
}
