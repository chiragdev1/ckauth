import type { Request } from 'express'
import { ipKeyGenerator, rateLimit, type Options, type Store } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { createClient } from 'redis'

import { ApiError } from '../../utils/api-error.js'
import { emailModel } from '../auth/models.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// with REDIS_URL every instance shares one count; without it each process counts on its own, which is fine for local development
const redisClient = process.env.REDIS_URL ? createClient({url: process.env.REDIS_URL}) : null

if(redisClient) {
  // without an error listener a lost connection would crash the process; the client reconnects on its own
  redisClient.on('error', (error) => console.error('Redis error:', error instanceof Error ? error.message : error))
  redisClient.connect().catch((error) => console.error('Could not connect to Redis:', error instanceof Error ? error.message : error))
}

function createStore(name: string): Store | undefined {
  if(!redisClient) {
    return undefined
  }
  return new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: `rl:${name}:`,
  })
}

type LimiterOptions = {
  name: string
  windowMs: number
  limit: number
  key?: (req: Request) => string
  // count only failed requests, so a user who gets their password right isn't slowed down by earlier typos
  failuresOnly?: boolean
}

function createRateLimiter({name, windowMs, limit, key, failuresOnly = false}: LimiterOptions) {
  const store = createStore(name)
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    // if Redis is down, let requests through rather than take sign in down with it; the error is still logged
    passOnStoreError: true,
    // the same 429 for every key, so a per-email limit doesn't reveal whether the email has an account
    handler: (_req, _res, next) => next(new ApiError(429, 'Too many requests, please try again later')),
    keyGenerator: key ?? ipKey,
  }
  if(store) {
    options.store = store
  }
  return rateLimit(options)
}

// ipKeyGenerator groups IPv6 addresses by /56 subnet, since one user usually controls a whole block of them
// req.ip is the real client because src/app/index.ts trusts exactly one proxy hop (caddy)
function ipKey(req: Request) {
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

// normalised exactly like the handlers do, so " JOHN@x.com" and "john@x.com" share a limit. a missing or invalid email
// falls back to the IP, and validation then rejects the request anyway
function emailKey(req: Request) {
  const parsed = emailModel.safeParse(req.body?.email)
  return parsed.success ? `email:${parsed.data}` : ipKey(req)
}

// runs after authenticateToken, so the user is known
function userKey(req: Request) {
  const userId = (req.user as any)?.id
  return userId ? `user:${userId}` : ipKey(req)
}

// a rejected request costs a redis round trip instead of a bcrypt hash, which is what keeps a flood from starving real users
export const rateLimits = {
  signinPerIp: createRateLimiter({name: 'signin-ip', windowMs: 15 * MINUTE, limit: 100}),
  signinPerEmail: createRateLimiter({name: 'signin-email', windowMs: 15 * MINUTE, limit: 5, key: emailKey, failuresOnly: true}),
  signupPerIp: createRateLimiter({name: 'signup-ip', windowMs: HOUR, limit: 10}),
  forgotPasswordPerIp: createRateLimiter({name: 'forgot-ip', windowMs: HOUR, limit: 10}),
  forgotPasswordPerEmail: createRateLimiter({name: 'forgot-email', windowMs: HOUR, limit: 3, key: emailKey}),
  verifyEmailPerIp: createRateLimiter({name: 'verify-ip', windowMs: 15 * MINUTE, limit: 20}),
  resetPasswordPerIp: createRateLimiter({name: 'reset-ip', windowMs: 15 * MINUTE, limit: 20}),
  refreshPerIp: createRateLimiter({name: 'refresh-ip', windowMs: MINUTE, limit: 60}),
  changePasswordPerUser: createRateLimiter({name: 'change-password-user', windowMs: 15 * MINUTE, limit: 5, key: userKey}),
  uploadAvatarPerUser: createRateLimiter({name: 'upload-avatar-user', windowMs: HOUR, limit: 10, key: userKey}),
  // invites send mail and deletes can't be undone, so even a stolen admin session can only do so much per window
  adminWritePerUser: createRateLimiter({name: 'admin-write-user', windowMs: 15 * MINUTE, limit: 30, key: userKey}),
  // a bcrypt compare, like sign-in: only wrong passwords count
  adminReauthPerUser: createRateLimiter({name: 'admin-reauth-user', windowMs: 15 * MINUTE, limit: 5, key: userKey, failuresOnly: true}),
}
