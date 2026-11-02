import jwt from 'jsonwebtoken'

import type { NextFunction, Request, Response } from "express";
import { ApiError } from '../../utils/api-error.js';
import { db } from '../../db/index.js';
import { usersTable } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { reqUserModel } from './models.js';
import type { UserRole } from './utils/constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: unknown
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

  if(typeof payload === 'string' || !payload.userId) {
    throw ApiError.unauthorized("Invalid token payload")
  }

  // select only safe fields from the user table and attach it to req.user
  const [userInDb] = await db.select({
    id: usersTable.id,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    age: usersTable.age,
    email: usersTable.email,
    emailVerified: usersTable.emailVerified,
    role: usersTable.role,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1)

  // the token is valid but the user no longer exists (e.g. account deleted)
  if(!userInDb) {
    throw ApiError.unauthorized("User not found")
  }

  // access tokens issued before sign in required a verified email are still valid until they expire
  if(!userInDb.emailVerified) {
    throw ApiError.forbidden("Please verify your email before signing in")
  }

  const safeUser = reqUserModel.parse(userInDb)
  req.user = safeUser
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
