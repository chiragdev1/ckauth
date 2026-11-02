import type { Request, Response } from 'express'
import { and, desc, eq, lt, notInArray } from 'drizzle-orm'

import { db } from '../../../db/index.js'
import { sessionsTable } from '../../../db/schema.js'
import { cookieOptions } from './constants.js'
import { generateAccessToken, generateRefreshToken, getTokenExpiry } from './jwt-token.js'
import { hashToken } from './tokens.js'

// signing in on an 11th device signs out the one used least recently, so a leaked password can't pile up sessions forever
export const MAX_SESSIONS_PER_USER = 10

// a transaction or the db itself, so a session can be started inside the same transaction as the write that allows it
type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

// what the device list shows; the user agent is whatever the browser claims, so it's cut to the column and never trusted
export function describeClient(req: Request) {
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) || null,
    // node reports ipv4 visitors as ipv4-mapped ipv6 (::ffff:203.0.113.7); people recognise the plain form
    ipAddress: req.ip?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '').slice(0, 45) || null,
  }
}

// a new row and a new pair of tokens; the access token carries the session id, so ending the session ends the token too
export async function startSession(executor: Executor, userId: string, req: Request) {
  const refreshToken = generateRefreshToken({userId})
  const expiresAt = getTokenExpiry(refreshToken)

  const [session] = await executor.insert(sessionsTable).values({
    userId,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt,
    ...describeClient(req),
  }).returning({id: sessionsTable.id})

  if(!session) {
    throw new Error('Could not create session')
  }

  await pruneSessions(executor, userId)

  return {sessionId: session.id, accessToken: generateAccessToken({userId, sid: session.id}), refreshToken}
}

// drops expired sessions, then all but the most recently used MAX_SESSIONS_PER_USER
async function pruneSessions(executor: Executor, userId: string) {
  await executor.delete(sessionsTable).where(and(eq(sessionsTable.userId, userId), lt(sessionsTable.expiresAt, new Date())))

  const newest = executor.select({id: sessionsTable.id}).from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.lastUsedAt), desc(sessionsTable.createdAt))
    .limit(MAX_SESSIONS_PER_USER)

  await executor.delete(sessionsTable).where(and(eq(sessionsTable.userId, userId), notInArray(sessionsTable.id, newest)))
}

export function setSessionCookies(res: Response, tokens: {accessToken: string, refreshToken: string}) {
  res.cookie('access_token', tokens.accessToken, {...cookieOptions, expires: getTokenExpiry(tokens.accessToken)})
  res.cookie('refresh_token', tokens.refreshToken, {...cookieOptions, expires: getTokenExpiry(tokens.refreshToken)})
}

export function clearSessionCookies(res: Response) {
  res.clearCookie('access_token', cookieOptions)
  res.clearCookie('refresh_token', cookieOptions)
}
