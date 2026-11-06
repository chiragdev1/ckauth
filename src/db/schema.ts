import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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

  // the ?ref= of the link that brought this person here (e.g. 'x'), set once at the first sign-up; null for direct visits
  signupSource: varchar('signup_source', {length: 32}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').$onUpdate( ()=> new Date())
}, (table) => [
  // every email link is looked up by its token hash; partial, since most users have no pending link, so the indexes stay small
  index('users_email_verification_token_idx').on(table.emailVerificationToken).where(sql`${table.emailVerificationToken} is not null`),
  index('users_reset_password_token_idx').on(table.resetPasswordToken).where(sql`${table.resetPasswordToken} is not null`),
  index('users_email_change_token_idx').on(table.emailChangeToken).where(sql`${table.emailChangeToken} is not null`),
]);


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


// the activity log: who did what to whom, when and from where. written in the same transaction as the action it records,
// so an action can't happen without its row. append-only: no endpoint edits or deletes a row; only pruneAuditEvents
// removes rows past their retention period
export const auditEventsTable = pgTable("audit_events", {
  id: uuid('id').primaryKey().defaultRandom(),
  action: varchar('action', {length: 40}).notNull(),

  // plain ids, no foreign keys: a row must outlive the users it mentions (a deleted account's deletion is the point).
  // actor is who acted (null for the server's manage-users script), target is whose account it was done to
  actorId: uuid('actor_id'),
  targetId: uuid('target_id'),

  // what the panel can't look up later, e.g. a deleted account's email. small and never a secret
  details: jsonb('details').$type<Record<string, string | number | boolean>>(),

  // 'api' or 'cli' (manage-users on the server)
  source: varchar('source', {length: 10}).notNull(),
  ipAddress: varchar('ip_address', {length: 45}),
  // the X-Request-Id, so an event leads to the request's lines in the application logs
  requestId: varchar('request_id', {length: 64}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('audit_events_created_at_idx').on(table.createdAt),
  index('audit_events_actor_id_idx').on(table.actorId),
  index('audit_events_target_id_idx').on(table.targetId),
])


// visits that arrived through one of our own tagged links (?ref=x), as one counter per source per day. no ip, no cookie,
// no user: a row can't tell anyone who visited, only how many. sign-ups are counted from users.signup_source instead
export const referralVisitsTable = pgTable("referral_visits", {
  day: date('day').defaultNow().notNull(),
  source: varchar('source', {length: 32}).notNull(),
  visits: integer('visits').default(0).notNull(),
}, (table) => [
  primaryKey({columns: [table.day, table.source]}),
])
