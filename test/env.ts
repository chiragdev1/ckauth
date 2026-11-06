// loaded with --import before any test file (and before the app's own `dotenv/config`), so these values win:
// dotenv never overrides a variable that is already set, even to ''
import { testDatabaseUrl } from './database-url.js'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = testDatabaseUrl()

// mails go to the in-memory outbox in src/utils/mail.ts instead of Resend
process.env.MAIL_TRANSPORT = 'memory'
process.env.RESEND_API_KEY = 're_test_unused'
process.env.EMAIL_FROM = 'CKAuth <no-reply@ckauth.test>'
process.env.FRONTEND_URL = 'http://ckauth.test'

// no request lines in the test output; request-logger.test.ts tests what would be logged directly
process.env.LOG_LEVEL = 'silent'

// no redis: each test file counts rate limits in its own memory, starting from zero
process.env.REDIS_URL = ''
// no imagekit: avatar deletes fail quietly (and are logged) instead of calling the real service
process.env.IMAGEKIT_PRIVATE_KEY = ''

// fixed values rather than the ones in .env, so token tests can assert exact lifetimes on any machine (and in CI, with no .env)
process.env.ACCESS_TOKEN_SECRET_KEY = 'test-access-secret'
process.env.REFRESH_TOKEN_SECRET_KEY = 'test-refresh-secret'
process.env.ACCESS_TOKEN_EXPIRY = '15m'
process.env.REFRESH_TOKEN_EXPIRY = '1d'
