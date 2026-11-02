// checks that a live site sends the security headers from deploy/ckauth.caddy, on the web app and on the api.
// run after every deploy (.github/workflows/deploy.yml), or by hand: node scripts/check-live-headers.js https://ckauth.chiragdev.com
// no dependencies, so the deploy job can run it without installing anything. exits 1 on any failure
const site = process.argv[2]?.replace(/\/$/, '')
if (!site) {
  console.error('usage: node scripts/check-live-headers.js https://<domain>')
  process.exit(2)
}

// each rule: a header, and what its value must satisfy (a header that must be absent checks for null)
const rules = [
  ['strict-transport-security', value => Number(value?.match(/max-age=(\d+)/)?.[1] ?? 0) >= 31536000, 'HSTS for at least a year'],
  ['x-content-type-options', value => value === 'nosniff', 'nosniff'],
  ['x-frame-options', value => value === 'DENY', 'DENY'],
  ['referrer-policy', value => value === 'no-referrer', 'no-referrer (links carry tokens)'],
  ['permissions-policy', value => /camera=\(\)/.test(value ?? ''), 'camera, microphone and location off'],
  ['content-security-policy', value => {
    const scriptSrc = value?.match(/script-src ([^;]+)/)?.[1] ?? ''
    return /default-src 'self'/.test(value ?? '') && /frame-ancestors 'none'/.test(value ?? '') && scriptSrc !== '' && !scriptSrc.includes("'unsafe-inline'")
  }, "default-src 'self', frame-ancestors 'none', no inline scripts"],
  ['server', value => value === null, 'absent (no server name or version)'],
  ['x-powered-by', value => value === null, 'absent (no framework name)'],
]

const failures = []
for (const path of ['/', '/api/']) {
  let response
  try {
    response = await fetch(`${site}${path}`, { redirect: 'manual' })
  } catch (error) {
    failures.push(`${path}: could not fetch (${error.message})`)
    continue
  }
  for (const [name, ok, want] of rules) {
    const value = response.headers.get(name)
    if (!ok(value)) failures.push(`${path}: ${name} is ${value === null ? 'missing' : `"${value}"`}, want ${want}`)
  }
}

for (const failure of failures) console.log(`  FAIL  ${failure}`)
console.log(`security headers: ${failures.length} failed (${site}, / and /api/)`)
process.exit(failures.length ? 1 : 0)
