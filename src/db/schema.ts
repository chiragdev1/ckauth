import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { availableUserRoles, userRolesEnum } from "../app/auth/utils/constants.js";

// a postgres enum, so the database itself rejects any role that isn't in the list
export const userRoleEnum = pgEnum('user_role', availableUserRoles)

export const usersTable = pgTable("users", {
  id: uuid('id').primaryKey().defaultRandom(),

  firstName: varchar('first_name', { length: 45 }).notNull(),
  lastName: varchar('last_name', {length: 45}),

  age: integer('age'),

  email: varchar('email', { length: 322 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),

  role: userRoleEnum('role').default(userRolesEnum.USER).notNull(),

  emailVerificationToken: varchar('email_verification_token', {length: 255}),
  emailVerificationTokenExpiry: timestamp('email_verification_token_expiry'),

  password: varchar('password', {length: 255}),

  resetPasswordToken: varchar('reset_password_token', {length: 255}),
  resetPasswordTokenExpiry: timestamp('reset_password_token_expiry'),

  // unused since sessions moved to their own table; kept so a rollback to the previous api image still works. drop it later
  refreshToken: text('refresh_token'),

  accountExistsMailSentAt: timestamp('account_exists_mail_sent_at'),

  // a requested change of email, waiting for the link sent to the new address; the email column only changes once it's opened
  pendingEmail: varchar('pending_email', {length: 322}),
  emailChangeToken: varchar('email_change_token', {length: 255}),
  emailChangeTokenExpiry: timestamp('email_change_token_expiry'),

  avatarUrl: text('avatar_url'),
  avatarFileId: varchar('avatar_file_id', {length: 255}),

  // unused since sudo mode moved to sessions.reauthenticated_at; kept for rollbacks like refresh_token. drop it later
  reauthenticatedAt: timestamp('reauthenticated_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').$onUpdate( ()=> new Date())
  
});


// one row per signed-in device. deleting a row signs that device out at once: the access token carries the session id,
// and authenticateToken checks the row still exists
export const sessionsTable = pgTable("sessions", {
  id: uuid('id').primaryKey().defaultRandom(),
  // deleting the user deletes their sessions with them
  userId: uuid('user_id').notNull().references(() => usersTable.id, {onDelete: 'cascade'}),

  // sha256 of the refresh token, never the token itself
  refreshTokenHash: varchar('refresh_token_hash', {length: 64}).notNull().unique(),

  // shown in the device list, so people can recognise a session that isn't theirs; cut to the column length
  userAgent: varchar('user_agent', {length: 512}),
  ipAddress: varchar('ip_address', {length: 45}),

  // when an admin last confirmed their password in this session; admin writes need it within ADMIN_REAUTH_WINDOW_MS
  reauthenticatedAt: timestamp('reauthenticated_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
])
