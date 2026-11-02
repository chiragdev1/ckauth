import 'dotenv/config'

// tests get their own database on the development server, ckauth_test, so they can empty tables freely.
// a fixed name rather than "<dev name>_test": another branch's suite already owns that one, with a different schema.
// TEST_DATABASE_URL overrides it, e.g. in CI
export function testDatabaseUrl() {
  if(process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL
  }

  const base = process.env.DATABASE_URL
  if(!base) {
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) in .env so the tests know which Postgres server to use')
  }

  // same server and credentials as development, different database
  const url = new URL(base)
  url.pathname = '/ckauth_test'
  return url.toString()
}
