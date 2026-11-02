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

// every kind of audit event (the admin panel's activity log); the zod filter in admin/models.ts is built from these values.
// a varchar, not a postgres enum, so adding an action needs no migration
export const auditActions = {
  SIGN_IN: 'sign_in',
  SIGN_IN_FAILED: 'sign_in_failed',
  EMAIL_VERIFIED: 'email_verified',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET: 'password_reset',
  EMAIL_CHANGED: 'email_changed',
  ACCOUNT_DELETED: 'account_deleted',
  ADMIN_REAUTH: 'admin_reauth',
  ADMIN_REAUTH_FAILED: 'admin_reauth_failed',
  USER_INVITED: 'user_invited',
  USER_DELETED: 'user_deleted',
  ROLE_CHANGED: 'role_changed',
} as const

export type AuditAction = typeof auditActions[keyof typeof auditActions]

export const availableAuditActions = Object.values(auditActions) as [AuditAction, ...AuditAction[]]
