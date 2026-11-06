// playwright.config.ts starts this as its API server (webServer), with PORT and FRONTEND_URL set. it runs the built app
// (dist/, so `pnpm build` first) against its own database, ckauth_e2e, so neither development data nor `pnpm test`'s
// ckauth_test is touched, and both suites can run at once.
// .ts imports with the extension: node runs this file itself and only strips the types
import 'dotenv/config'
import { prepareDatabase } from '../test/global-setup.ts'

function e2eDatabaseUrl() {
  if(process.env.E2E_DATABASE_URL) {
    return process.env.E2E_DATABASE_URL
  }
  if(!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL (or E2E_DATABASE_URL) in .env so the e2e tests know which Postgres server to use')
  }
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = '/ckauth_e2e'
  return url.toString()
}

// set before the app is imported, so these win over .env (dotenv never overrides a variable that is already set)
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = e2eDatabaseUrl()

// mails stay in memory; the tests read them through GET /dev/outbox, the way a user would open their inbox
process.env.MAIL_TRANSPORT = 'memory'
process.env.RESEND_API_KEY = 're_test_unused'
process.env.EMAIL_FROM = 'CKAuth <no-reply@ckauth.test>'

// warnings and errors still reach the terminal; one line per request would bury them
process.env.LOG_LEVEL = 'warn'

// no redis: rate limits are counted in this process's memory, so every test shares them (see fixtures.ts, fake IPs)
process.env.REDIS_URL = ''
process.env.IMAGEKIT_PRIVATE_KEY = ''

process.env.ACCESS_TOKEN_SECRET_KEY = 'e2e-access-secret'
process.env.REFRESH_TOKEN_SECRET_KEY = 'e2e-refresh-secret'
process.env.ACCESS_TOKEN_EXPIRY = '15m'
process.env.REFRESH_TOKEN_EXPIRY = '1d'

await prepareDatabase(process.env.DATABASE_URL)
await import('../dist/index.js')
