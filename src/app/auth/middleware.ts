import jwt from 'jsonwebtoken'

import type { NextFunction, Request, Response } from "express";
import { ApiError } from '../../utils/api-error.js';
import { db } from '../../db/index.js';
import { sessionsTable, usersTable } from '../../db/schema.js';
import { and, eq, gt } from 'drizzle-orm';
import { reqUserModel } from './models.js';
import type { UserRole } from './utils/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: unknown
      // the signed-in device's session (sessions table), set by authenticateToken
      sessionId?: string
    }
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // extract the token from req.cookies
  const token: string | undefined = req.cookies?.access_token;
  const secret = process.env.ACCESS_TOKEN_SECRET_KEY;

  if(!secret) {
    throw new Error("ACCESS_TOKEN_SECRET_KEY is not set")
  }
  if(!token) {
    throw ApiError.unauthorized("Token not provided")
  }

  // decode the token and extract the id
  let payload: string | jwt.JwtPayload
  try {
    payload = jwt.verify(token, secret)
  } catch {
    throw ApiError.unauthorized("Invalid or expired token")
  }

  // tokens from before sessions existed have no sid; they get a 401, the refresh fails too, and the user signs in again
  if(typeof payload === 'string' || !payload.userId || !payload.sid) {
    throw ApiError.unauthorized("Invalid token payload")
  }

  // select only safe fields from the user table and attach it to req.user. the join on the session means a device that
  // was signed out (logout, "sign out" in the device list, a password change) loses access at once, not when the token expires
  const [userInDb] = await db.select({
    id: usersTable.id,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    age: usersTable.age,
    email: usersTable.email,
    emailVerified: usersTable.emailVerified,
    role: usersTable.role,
    avatarUrl: usersTable.avatarUrl,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .innerJoin(sessionsTable, and(eq(sessionsTable.userId, usersTable.id), eq(sessionsTable.id, payload.sid), gt(sessionsTable.expiresAt, new Date())))
    .where(eq(usersTable.id, payload.userId)).limit(1)

  // the token is valid but the user or the session no longer exists (account deleted, or this device signed out)
  if(!userInDb) {
    throw ApiError.unauthorized("Session has ended")
  }

  // access tokens issued before sign in required a verified email are still valid until they expire
  if(!userInDb.emailVerified) {
    throw ApiError.forbidden("Please verify your email before signing in")
  }

  const safeUser = reqUserModel.parse(userInDb)
  req.user = safeUser
  req.sessionId = payload.sid
  next()
}

// runs after authenticateToken; the role is read from the database on every request, so a demoted admin loses access at once
export function authorizeRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user as any)?.role

    if(!roles.includes(role)) {
      throw ApiError.forbidden('You do not have permission to access this resource')
    }

    next()
  }
}

// add middleware to validate cookies before authenticateToken middleware
