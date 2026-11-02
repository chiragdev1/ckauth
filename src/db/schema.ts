import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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

  refreshToken: text('refresh_token'),

  accountExistsMailSentAt: timestamp('account_exists_mail_sent_at'),

  avatarUrl: text('avatar_url'),
  avatarFileId: varchar('avatar_file_id', {length: 255}),

  // when an admin last confirmed their password; admin writes need it within ADMIN_REAUTH_WINDOW_MS
  reauthenticatedAt: timestamp('reauthenticated_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').$onUpdate( ()=> new Date())
  
});

