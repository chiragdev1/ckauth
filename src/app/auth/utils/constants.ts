import type { CookieOptions } from 'express'

export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
}

// one cost for every hash (including admin-created accounts), so the dummy compare in sign-in takes exactly as long as a real one
export const PASSWORD_HASH_ROUNDS = 10

// email links point at frontend pages, which post the token to the api
export function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000'
}

// every role a user can have; the database enum in schema.ts is built from these values, so they stay in sync
export const userRolesEnum = {
  USER: 'user',
  ADMIN: 'admin',
} as const

export type UserRole = typeof userRolesEnum[keyof typeof userRolesEnum]

export const availableUserRoles = Object.values(userRolesEnum) as [UserRole, ...UserRole[]]

// how long a confirmed password unlocks admin writes ("sudo mode"); after that the admin confirms it again
export const ADMIN_REAUTH_WINDOW_MS = 15 * 60 * 1000

// invite links last longer than reset links (15 minutes), because the person didn't ask for the mail and may open it days later
export const INVITE_LINK_LIFETIME_MS = 72 * 60 * 60 * 1000
