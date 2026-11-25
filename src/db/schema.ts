import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { availableUserRoles, userRolesEnum } from "../app/auth/utils/constants.js";
import { oauthClientStatuses, oauthClientTypes, oidcScopes } from "../app/oidc/constants.js";

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


// ---- sign in with ckauth (oidc). design and the 33 rules: docs/OIDC.md. ---------------------------------------------
// the database enforces what it can (formats, lifetimes, allowed values), so a bug in the endpoints hits a constraint
// error instead of opening a hole. three conventions, different from the tables above on purpose:
//  - timestamptz (with time zone), so js dates and the database's now() compare correctly; the lifetime checks need it
//  - token and secret columns hold a sha256 hex digest (hashToken in auth/utils/tokens.ts), never the value itself
//  - no column marks an app as trusted, first-party or exempt (rule 27; scripts/checks/oidc-flags.js fails the build)
const tstz = (name: string) => timestamp(name, {withTimezone: true})
const sha256Hex = (column: string) => sql`${sql.raw(column)} ~ '^[0-9a-f]{64}$'`
// array_position(…, null) finds a NULL element (it compares with IS NOT DISTINCT FROM). `= any()` and the pattern checks
// below skip NULLs, so without this '{https://a, NULL}' would pass them all
const noNulls = (column: string) => sql`array_position(${sql.raw(column)}, null) is null`
// a redirect uri as rule 7 allows: https (no user:password@ before the host), the loopback http://127.0.0.1 with any
// port, or a private-use reverse-domain scheme (com.example.app:/callback, RFC 8252). never a fragment, whitespace or a
// control character. the code checks again with a real url parser; this is the layer a bug can't skip
const uriChar = '[^[:space:][:cntrl:]#]'
const redirectUri = `(https://[^[:space:][:cntrl:]#/@?]+(/${uriChar}*)?|http://127\\.0\\.0\\.1(:[0-9]{1,5})?(/${uriChar}*)?|[a-z][a-z0-9+-]*(\\.[a-z0-9+-]+)+:/${uriChar}*)`
// whitespace can't occur inside one, so joining with a space and matching the whole string checks every element
const allMatch = (column: string, element: string) => sql.raw(`array_to_string(${column}, ' ') ~ '^${element}( ${element})*$'`)
const oneMatches = (column: string, element: string) => sql.raw(`${column} ~ '^${element}$'`)
const MAX_URI_LENGTH = 2048
const MAX_LIST = 10
// a browser origin: scheme and host (and port), nothing else; https, or the loopback for local development
const origin = '(https://[a-z0-9.-]+(:[0-9]{1,5})?|http://127\\.0\\.0\\.1(:[0-9]{1,5})?)'
// a host or a reverse-domain scheme, lowercase
const sectorPattern = '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
// control characters and the invisible ones that can make a name look like another (zero-width, bidi overrides)
const invisibleChars = '[\\u0001-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff]'

// the database rejects a scope the code doesn't handle, in every table that stores one
export const oauthScopeEnum = pgEnum('oauth_scope', oidcScopes)
export const oauthClientTypeEnum = pgEnum('oauth_client_type', oauthClientTypes)
export const oauthClientStatusEnum = pgEnum('oauth_client_status', oauthClientStatuses)

// a registered app. only an admin registers one (sudo mode, audited); its id is the public client_id
export const oauthClientsTable = pgTable('oauth_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 80}).notNull(),
  type: oauthClientTypeEnum('type').notNull(),

  // confidential clients only. two at once during a rotation (rule 8): the old one keeps working until its expiry
  secretHash: varchar('secret_hash', {length: 64}),
  previousSecretHash: varchar('previous_secret_hash', {length: 64}),
  previousSecretExpiresAt: tstz('previous_secret_expires_at'),

  // compared character for character, at /authorize and again at /token (rule 6); format rules are checked when an
  // admin registers them (rule 7), since they need url parsing the database can't do
  redirectUris: text('redirect_uris').array().notNull(),
  postLogoutRedirectUris: text('post_logout_redirect_uris').array().default(sql`'{}'`).notNull(),
  allowedScopes: oauthScopeEnum('allowed_scopes').array().notNull(),
  // cors for public clients (rule 25); a confidential client calls from its server and needs none
  allowedOrigins: text('allowed_origins').array().default(sql`'{}'`).notNull(),
  // the host every redirect uri shares, lowercase; decides the pairwise sub (rule 7)
  sector: varchar('sector', {length: 253}).notNull(),

  status: oauthClientStatusEnum('status').default('active').notNull(),
  // accountability: which admin registered it. the audit log keeps the full history, so a deleted admin leaves null
  registeredBy: uuid('registered_by').references(() => usersTable.id, {onDelete: 'set null'}),

  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').$onUpdate(() => new Date()),
}, (table) => [
  // a confidential client always has a secret; a public one never does, and gets no secret through a rotation either
  check('oauth_clients_secret_matches_type', sql`(${table.type} = 'confidential' and ${table.secretHash} is not null) or (${table.type} = 'public' and ${table.secretHash} is null and ${table.previousSecretHash} is null)`),
  check('oauth_clients_secret_hash_format', sql`${table.secretHash} is null or ${sha256Hex('secret_hash')}`),
  check('oauth_clients_previous_secret_hash_format', sql`${table.previousSecretHash} is null or ${sha256Hex('previous_secret_hash')}`),
  // an old secret always has an end date: a rotation can't leave two secrets working forever
  check('oauth_clients_previous_secret_expires', sql`(${table.previousSecretHash} is null) = (${table.previousSecretExpiresAt} is null)`),
  check('oauth_clients_has_redirect_uri', sql`cardinality(${table.redirectUris}) between 1 and ${sql.raw(String(MAX_LIST))}`),
  check('oauth_clients_redirect_uris_format', sql`${noNulls('redirect_uris')} and char_length(array_to_string(${table.redirectUris}, ' ')) <= ${sql.raw(String(MAX_LIST * (MAX_URI_LENGTH + 1)))} and ${allMatch('redirect_uris', redirectUri)}`),
  check('oauth_clients_post_logout_uris_format', sql`${noNulls('post_logout_redirect_uris')} and cardinality(${table.postLogoutRedirectUris}) <= ${sql.raw(String(MAX_LIST))} and (cardinality(${table.postLogoutRedirectUris}) = 0 or ${allMatch('post_logout_redirect_uris', redirectUri)})`),
  check('oauth_clients_scopes_no_nulls', noNulls('allowed_scopes')),
  check('oauth_clients_origins_format', sql`${noNulls('allowed_origins')} and cardinality(${table.allowedOrigins}) <= ${sql.raw(String(MAX_LIST))} and (cardinality(${table.allowedOrigins}) = 0 or ${allMatch('allowed_origins', origin)})`),
  // it's openid connect: every app can at least ask who signed in
  check('oauth_clients_allows_openid', sql`'openid' = any(${table.allowedScopes})`),
  check('oauth_clients_origins_only_public', sql`${table.type} = 'public' or cardinality(${table.allowedOrigins}) = 0`),
  check('oauth_clients_sector_format', sql.raw(`sector ~ '${sectorPattern}'`)),
  // shown on the consent screen next to the host (rule 12): no blank name, and nothing invisible that could disguise it
  check('oauth_clients_name_present', sql`btrim(${table.name}) <> ''`),
  check('oauth_clients_name_visible', sql.raw(`name !~ '${invisibleChars}'`)),
])

// an /authorize request waiting for sign-in and consent. its id is what /sign-in?continue= carries (an id, never a url).
// bound to the browser that started it (rule 10); used once: consent deletes the row with DELETE … RETURNING
export const oauthRequestsTable = pgTable('oauth_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => oauthClientsTable.id, {onDelete: 'cascade'}),
  // sha256 of a random cookie set on the browser that started the request
  browserBindingHash: varchar('browser_binding_hash', {length: 64}).notNull(),

  // already validated against the client by /authorize
  redirectUri: text('redirect_uri').notNull(),
  scopes: oauthScopeEnum('scopes').array().notNull(),
  state: varchar('state', {length: 512}),
  nonce: varchar('nonce', {length: 512}),
  // s256 only (rule 2), so there's no method column: a stored challenge is always base64url(sha256(verifier))
  codeChallenge: varchar('code_challenge', {length: 43}).notNull(),
  // the prompt values asked for (none, login, consent, select_account) and max_age in seconds (rule 22)
  prompt: varchar('prompt', {length: 64}),
  maxAge: integer('max_age'),

  createdAt: tstz('created_at').defaultNow().notNull(),
  // set with the database clock (now() + interval), so the lifetime check below holds exactly
  expiresAt: tstz('expires_at').notNull(),
}, (table) => [
  check('oauth_requests_binding_hash_format', sha256Hex('browser_binding_hash')),
  check('oauth_requests_code_challenge_format', sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
  check('oauth_requests_asks_openid', sql`'openid' = any(${table.scopes}) and ${noNulls('scopes')}`),
  check('oauth_requests_redirect_uri_format', sql`char_length(${table.redirectUri}) <= ${sql.raw(String(MAX_URI_LENGTH))} and ${oneMatches('redirect_uri', redirectUri)}`),
  // OIDC Core 3.1.2.1: space-separated values, and none can't be combined with any other
  check('oauth_requests_prompt_values', sql`${table.prompt} is null or ${table.prompt} ~ '^(none|(login|consent|select_account)( (login|consent|select_account))*)$'`),
  check('oauth_requests_max_age_positive', sql`${table.maxAge} is null or ${table.maxAge} >= 0`),
  check('oauth_requests_lifetime', sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '10 minutes'`),
  index('oauth_requests_expires_at_idx').on(table.expiresAt),
  // deleting an app cascades here
  index('oauth_requests_client_id_idx').on(table.clientId),
])

// an authorization code: lives 60 seconds and works once. redeemed with a conditional
// UPDATE … SET used_at = now() WHERE used_at IS NULL RETURNING, so two racing requests can't both win. a second use
// revokes every refresh token of its family (RFC 9700 §4.5)
export const oauthCodesTable = pgTable('oauth_codes', {
  codeHash: varchar('code_hash', {length: 64}).primaryKey(),
  clientId: uuid('client_id').notNull().references(() => oauthClientsTable.id, {onDelete: 'cascade'}),
  userId: uuid('user_id').notNull().references(() => usersTable.id, {onDelete: 'cascade'}),
  // every refresh token issued from this code carries it, so a reused code can revoke them all
  familyId: uuid('family_id').defaultRandom().notNull(),

  // /token must present the same one (rule 6) and the verifier for this challenge (rules 2–3)
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: varchar('code_challenge', {length: 43}).notNull(),
  nonce: varchar('nonce', {length: 512}),
  scopes: oauthScopeEnum('scopes').array().notNull(),
  // when the user last typed their password, for the id token's auth_time and max_age
  authTime: tstz('auth_time').notNull(),

  createdAt: tstz('created_at').defaultNow().notNull(),
  expiresAt: tstz('expires_at').notNull(),
  usedAt: tstz('used_at'),
}, (table) => [
  check('oauth_codes_code_hash_format', sha256Hex('code_hash')),
  check('oauth_codes_code_challenge_format', sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
  check('oauth_codes_asks_openid', sql`'openid' = any(${table.scopes}) and ${noNulls('scopes')}`),
  check('oauth_codes_redirect_uri_format', sql`char_length(${table.redirectUri}) <= ${sql.raw(String(MAX_URI_LENGTH))} and ${oneMatches('redirect_uri', redirectUri)}`),
  check('oauth_codes_lifetime', sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '60 seconds'`),
  index('oauth_codes_user_id_idx').on(table.userId),
  index('oauth_codes_client_id_idx').on(table.clientId),
  index('oauth_codes_expires_at_idx').on(table.expiresAt),
])

// what a user allowed an app to see. widening an app's scopes asks again (rule 29): consent covers only these
export const oauthConsentsTable = pgTable('oauth_consents', {
  userId: uuid('user_id').notNull().references(() => usersTable.id, {onDelete: 'cascade'}),
  clientId: uuid('client_id').notNull().references(() => oauthClientsTable.id, {onDelete: 'cascade'}),
  scopes: oauthScopeEnum('scopes').array().notNull(),
  createdAt: tstz('created_at').defaultNow().notNull(),
  updatedAt: tstz('updated_at').$onUpdate(() => new Date()),
}, (table) => [
  primaryKey({columns: [table.userId, table.clientId]}),
  check('oauth_consents_includes_openid', sql`'openid' = any(${table.scopes}) and ${noNulls('scopes')}`),
  // "how many users" per app for the admin page (rule 30), and the cascade when an app is deleted
  index('oauth_consents_client_id_idx').on(table.clientId),
])

// refresh tokens (only with offline_access, rule 17). each use marks the row used and issues the next one in the same
// family; presenting a used one again is theft, and deletes the whole family. 30 days absolute, 14 days idle
export const oauthRefreshTokensTable = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', {length: 64}).notNull().unique(),
  familyId: uuid('family_id').notNull(),
  clientId: uuid('client_id').notNull().references(() => oauthClientsTable.id, {onDelete: 'cascade'}),
  userId: uuid('user_id').notNull().references(() => usersTable.id, {onDelete: 'cascade'}),
  // a refresh can narrow these, never widen them (rule 20)
  scopes: oauthScopeEnum('scopes').array().notNull(),
  authTime: tstz('auth_time').notNull(),

  createdAt: tstz('created_at').defaultNow().notNull(),
  // absolute: the family's start + 30 days, copied to every token in the family, so rotating never extends it
  expiresAt: tstz('expires_at').notNull(),
  // idle: this token's creation + 14 days, capped at the absolute expiry
  idleExpiresAt: tstz('idle_expires_at').notNull(),
  usedAt: tstz('used_at'),
}, (table) => [
  check('oauth_refresh_tokens_token_hash_format', sha256Hex('token_hash')),
  check('oauth_refresh_tokens_offline_access', sql`'offline_access' = any(${table.scopes}) and 'openid' = any(${table.scopes}) and ${noNulls('scopes')}`),
  check('oauth_refresh_tokens_lifetime', sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '30 days'`),
  check('oauth_refresh_tokens_idle_lifetime', sql`${table.idleExpiresAt} <= ${table.expiresAt} and ${table.idleExpiresAt} <= ${table.createdAt} + interval '14 days'`),
  index('oauth_refresh_tokens_family_id_idx').on(table.familyId),
  index('oauth_refresh_tokens_user_id_idx').on(table.userId),
  index('oauth_refresh_tokens_client_id_idx').on(table.clientId),
  // the prune job (M3) deletes by idle expiry: idle is never later than absolute, so it covers both
  index('oauth_refresh_tokens_idle_expires_at_idx').on(table.idleExpiresAt),
])

// the pairwise sub: one random value per (user, sector), stored rather than derived, so it survives key rotation, and
// deleted with the account, so a new account with the same email gets a new one (docs/OIDC.md, "Pairwise sub")
export const oauthSubjectsTable = pgTable('oauth_subjects', {
  userId: uuid('user_id').notNull().references(() => usersTable.id, {onDelete: 'cascade'}),
  sector: varchar('sector', {length: 253}).notNull(),
  // 32 random bytes, base64url (43 characters); unique, so two users can never share one
  subject: varchar('subject', {length: 43}).notNull().unique(),
  createdAt: tstz('created_at').defaultNow().notNull(),
}, (table) => [
  primaryKey({columns: [table.userId, table.sector]}),
  check('oauth_subjects_subject_format', sql`${table.subject} ~ '^[A-Za-z0-9_-]{43}$'`),
  // the same format as oauth_clients.sector, so one host can't hand out two subs under two spellings
  check('oauth_subjects_sector_format', sql.raw(`sector ~ '${sectorPattern}'`)),
])
