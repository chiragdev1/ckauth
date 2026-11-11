import jwt, {type SignOptions} from 'jsonwebtoken'
import dotenv from 'dotenv'
import crypto from 'crypto'
import { ApiError } from '../../../utils/api-error.js';

dotenv.config()


// jwtid makes every token unique, even two issued for the same user in the same second
export function generateAccessToken(payload: object) {
  const secret = process.env.ACCESS_TOKEN_SECRET_KEY as string
  const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: process.env.ACCESS_TOKEN_EXPIRY as NonNullable<SignOptions['expiresIn']>, jwtid: crypto.randomUUID() })
  return token
}

export function generateRefreshToken(payload: object) {
  const secret = process.env.REFRESH_TOKEN_SECRET_KEY as string
  const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: process.env.REFRESH_TOKEN_EXPIRY as NonNullable<SignOptions['expiresIn']>, jwtid: crypto.randomUUID() })
  return token
}

// read the expiry date from a signed token (used to set cookie expiry)
export function getTokenExpiry(token: string) {
  const payload = jwt.decode(token) as jwt.JwtPayload
  return new Date(payload.exp! * 1000)
}

export function verifyRefreshToken(token: string) {
  const secret = process.env.REFRESH_TOKEN_SECRET_KEY

  if(!secret) {
    throw new Error("REFRESH_TOKEN_SECRET_KEY is not set")
  }

  let payload: string | jwt.JwtPayload
  try {
    // named, not inferred (see middleware.ts): only the algorithm we sign with is accepted
    payload = jwt.verify(token, secret, {algorithms: ['HS256']})
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token")
  }

  if(typeof payload === 'string' || !payload.userId) {
    throw ApiError.unauthorized("Invalid refresh token payload")
  }

  return payload
}
