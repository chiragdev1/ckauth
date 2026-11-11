# CKAuth context index

A map for Claude Code: where each thing lives and which files change together, so a task starts by opening the right
3–5 files instead of scanning. **CLAUDE.md holds the rules and is always loaded; this file never repeats it.** Read the
section you need (the index below), then open the files it names.

- **Snapshot:** 7 Nov 2026, `feat/oidc-provider` at `028bcb7` plus uncommitted work (§9). Line numbers are hints that
  drift by a few lines; symbol names are the stable key, so `grep -n <symbol>` when a line is off.
- **Refresh:** §10 has the commands that regenerate every table here.

## Index

1. [Request path](#1-request-path): how a request flows through the code
2. [Endpoint matrix](#2-endpoint-matrix): endpoint → handler → limiter → model → audit → mail → frontend → test
3. [Backend file map](#3-backend-file-map): every src/ file, its key symbols, size
4. [Data model](#4-data-model): tables, columns that matter, migrations
5. [Frontend file map](#5-frontend-file-map): routes, pages and their sections, lib, components
6. [Change recipes](#6-change-recipes): "to do X, touch these files", the cross-file couplings
7. [Tests, checks and CI](#7-tests-checks-and-ci): which test covers what, what each check enforces
8. [Docs map](#8-docs-map): which doc answers what, with line numbers into the long ones
9. [Current state and traps](#9-current-state-and-traps): branch work in progress, stale docs, things that surprise
10. [Maintaining this file](#10-maintaining-this-file)

---

## 1. Request path

```
browser ──/api/*──▶ edge Caddy (deploy/ckauth.caddy: strips /api, CSP + headers) ──▶ ckauth-api :8080
  src/index.ts                       http server, keepAlive 125s, pruneAuditEvents daily
  src/app/index.ts                   createExpressApplication(): trust proxy 1 → requestLogger → json(50kb) → cookieParser
    /auth    src/app/auth/routes.ts      rateLimits.* → authenticateToken → [uploadAvatar] → AuthController.handleX
    /admin   src/app/admin/routes.ts     router.use(authenticateToken, authorizeRoles('admin')) → limiter → requireRecentReauth → AdminController
    /metrics src/app/metrics/routes.ts   metricsVisitPerIp → MetricsController.handleVisit
    /dev     src/app/dev/routes.ts       only when NODE_ENV !== 'production'
    errorHandler (src/app/middlewares/error-handler.ts) last
handler: parseOrThrow(model, req.body) → db query → check → db.transaction(tx → write + recordEvent(tx)) → send*Mail().catch → ApiResponse.ok
```

Frontend side: page → `api()` in `frontend/src/lib/api.ts` (only `fetch`; `/api` prefix; on 401 for `authed`
requests a single-flight `POST /auth/refresh`, then retry) → `describeError()` in `lib/validation.ts` maps the API
error onto form fields.

## 2. Endpoint matrix

Controller line = where `handleX` starts. "Audit" is the `auditActions` key written (`tx` = inside the transaction,
`db` = outside, nothing to roll back). Tests: the main file; `rate-limits`, `request-logger`, `mail-failure` also hit most.

| Endpoint | Handler (line) | Limiters (`rateLimits.`) | Model (`models.ts`) | Audit | Mail sent | Frontend caller | Test | API.md |
|---|---|---|---|---|---|---|---|---|
| POST /auth/sign-up | handleSignup (54) | signupPerIp, signupPerEmail | signupPayloadModel | none (dropped 6 Nov) | EmailVerification / AccountExists | pages/sign-up.tsx | sign-up | 167 |
| POST /auth/sign-in | handleSignin (141) | signinPerIp, signinPerEmail (failures only) | signinPayloadModel | SIGN_IN_FAILED db, SIGN_IN tx | EmailVerification (unverified), NewSignIn (unknown browser) | pages/sign-in.tsx | sign-in | 233 |
| POST /auth/verify-email/:token | handleVerifyEmail (211) | verifyEmailPerIp | verifyEmailPayloadModel | EMAIL_VERIFIED tx | Welcome | pages/verify-email.tsx | verify-email | 199 |
| POST /auth/logout | handleLogout (265) | none | none | none | none | lib/auth.tsx | session | 287 |
| GET /auth/me | handleMe (281) | none | none | none | none | lib/auth.tsx | session | 301 |
| POST /auth/refresh | handleRefresh (345) | refreshPerIp | none (cookie) | none | none | lib/api.ts (auto) | session | 262 |
| GET /auth/sessions | handleListSessions (286) | none | none | none | none | dashboard.tsx useSessions | session | 447 |
| DELETE /auth/sessions/:id | handleRevokeSession (304) | none | sessionIdParamsModel | SESSIONS_REVOKED tx `{count:1,current}` | none | dashboard.tsx SessionsCard | session | 475 |
| DELETE /auth/sessions | handleRevokeOtherSessions (330) | none | none | SESSIONS_REVOKED tx `{count}` (only if ≥ 1) | none | dashboard.tsx SessionsCard | session | 494 |
| POST /auth/forgot-password | handleForgotPassword (396) | forgotPasswordPerIp, forgotPasswordPerEmail | forgotPasswordPayloadModel | none | ResetPassword | pages/forgot-password.tsx | password | 585 |
| POST /auth/reset-password/:token | handleResetPassword (427) | resetPasswordPerIp | resetPasswordPayloadModel | PASSWORD_RESET tx | none | pages/reset-password.tsx | password | 607 |
| POST /auth/change-password | handleChangePassword (474) | changePasswordPerUser | changePasswordPayloadModel | PASSWORD_CHANGED tx | none | dashboard.tsx ChangePasswordCard | password | 636 |
| POST /auth/upload-avatar | handleUploadAvatar (512) | uploadAvatarPerUser (+ multer `uploadAvatar`) | none (file) | AVATAR_CHANGED tx `{removed:false}` | none | dashboard.tsx ProfileCard | upload-avatar | 506 |
| DELETE /auth/avatar | handleDeleteAvatar (561) | uploadAvatarPerUser | none | AVATAR_CHANGED tx `{removed:true}` (only if a photo existed) | none | dashboard.tsx ProfileCard | account | 547 |
| PATCH /auth/me | handleUpdateProfile (592) | none | updateProfilePayloadModel | PROFILE_UPDATED tx (`profileChangeDetails`) | none | dashboard.tsx EditProfileForm | account | 338 |
| DELETE /auth/me | handleDeleteAccount (618) | deleteAccountPerUser (failures only) | deleteAccountPayloadModel | ACCOUNT_DELETED tx | AccountDeleted('user') | dashboard.tsx DeleteAccountCard | account | 367 |
| POST /auth/change-email | handleChangeEmail (676) | changeEmailPerUser | changeEmailPayloadModel | EMAIL_CHANGE_REQUESTED tx, or db when the address is taken (same shape) | ConfirmEmailChange (new) + EmailChangeRequested (old), or EmailTaken | dashboard.tsx ChangeEmailForm | account | 394 |
| POST /auth/confirm-email/:token | handleConfirmEmailChange (743) | confirmEmailChangePerIp | confirmEmailChangePayloadModel | EMAIL_CHANGED tx | EmailChanged (old address) | pages/confirm-email.tsx | account | 423 |
| POST /auth/resend-verification | handleResendVerification (800) | resendVerificationPerIp, resendVerificationPerEmail | resendVerificationPayloadModel | none | EmailVerification | components/resend-email.tsx | account | 561 |
| GET /admin/stats | handleStats (admin 60) | none | none | none | none | lib/admin.ts useAdminData | admin, metrics | 704 |
| GET /admin/users | handleListUsers (103) | none | listUsersQueryModel | none | none | lib/admin.ts useAdminData | admin | 730 |
| GET /admin/activity | handleListActivity (234) | none | listActivityQueryModel | none | none | lib/admin.ts useActivity | activity | 775 |
| POST /admin/reauth | handleReauth (123) | adminReauthPerUser (failures only) | reauthPayloadModel | ADMIN_REAUTH tx, ADMIN_REAUTH_FAILED db | none | admin.tsx ReauthDialog | admin | 838 |
| POST /admin/users | handleInviteUser (145) | adminWritePerUser + requireRecentReauth | inviteUserPayloadModel (.strict) | USER_INVITED tx | Invite | admin.tsx InviteUserForm | admin | 863 |
| DELETE /admin/users/:id | handleDeleteUser (183) | adminWritePerUser + requireRecentReauth | userIdParamsModel | USER_DELETED tx | AccountDeleted (verified only) | admin.tsx DeleteUserButton | admin | 892 |
| POST /metrics/visit | handleVisit (metrics 11) | metricsVisitPerIp | visitPayloadModel (metrics/models.ts) | none | none | lib/referral.ts captureReferral | metrics | 666 |
| GET /dev/emails, /dev/emails/:id, /dev/outbox | inline in dev/routes.ts | none | inline zod | none | none | pages/dev-emails.tsx, e2e/fixtures.ts | emails | n/a |

`ROLE_CHANGED` and a CLI `USER_DELETED` are written only by `src/scripts/manage-users.ts` (lines 31, 53, `source: 'cli'`).
Audit lines: `recordEvent` calls in controller.ts at 156, 197, 250, 313, 337, 461, 503, 539, 575, 606, 649, 707, 723, 777; admin/controller.ts 132, 139, 165, 203.
No event, on purpose: sign-up (dropped 6 Nov 2026, kept in a git stash), logout, refresh, reads, forgot-password, resend.

## 3. Backend file map

Lines in brackets are file sizes, so you know whether to read the whole file.

**`src/app/auth/`**
- `controller.ts` [793]: `AuthController`. Top-of-file constants: `DUMMY_PASSWORD_HASH` (timing-safe "no such user"),
  `VERIFICATION_LINK_MS`, `RESET_LINK_MS` (15 min), `ACCOUNT_EXISTS_MAIL_COOLDOWN_MS`, `EMAIL_CHANGE_LINK_MS` (60 min),
  `RESEND_COOLDOWN_MS` (60 s), `verificationUrl()`, `profileChangeDetails()` (what `profile_updated` keeps). Handler lines in §2.
- `routes.ts` [34]: every `/auth` route on one line each; the order of middleware there is the contract.
- `models.ts` [108]: shared field models `emailModel` (7), `firstNameModel` (15), `lastNameModel` (16),
  `existingPasswordModel` (21); payload models from 27 on; `reqUserModel` (48) is what `authenticateToken` builds.
- `middleware.ts` [83]: `authenticateToken` (22; pinned `HS256`, reads the user and session row every request, 401 if
  the session row is gone, 403 if unverified), `authorizeRoles` (72).
- `utils/sessions.ts` [66]: `MAX_SESSIONS_PER_USER` 10, `Executor` type (db or tx), `describeClient`, `startSession`,
  `setSessionCookies`, `clearSessionCookies`.
- `utils/jwt-token.ts` [48]: `generateAccessToken`, `generateRefreshToken` (HS256, random `jwtid`), `getTokenExpiry`,
  `verifyRefreshToken`.
- `utils/tokens.ts` [12]: `hashToken` (sha256), `createTempToken()` → `{token, hashedToken}` (32 random bytes hex; the raw one goes in the link, the hash in the db).
- `utils/audit.ts` [51]: `recordEvent(executor, req|null, event)`, `ROUTINE_EVENT_RETENTION_DAYS` 90,
  `ACCOUNT_EVENT_RETENTION_DAYS` 365, `pruneAuditEvents`.
- `utils/constants.ts` [52]: `cookieOptions`, `PASSWORD_HASH_ROUNDS` 10, `getFrontendUrl()`, `userRolesEnum`,
  `availableUserRoles`, `ADMIN_REAUTH_WINDOW_MS` 15 min, `INVITE_LINK_LIFETIME_MS` 72 h, `auditActions` (35, 16 actions).
- `utils/user-columns.ts` [15]: `safeUserColumns` = id, firstName, lastName, age, email, emailVerified, role, avatarUrl, createdAt.

**`src/app/admin/`**: `controller.ts` [261] (`adminUserFields` adds `lastActiveAt`, `deviceCount` subqueries;
`activityFields` joins users twice as `actor_users`/`target_users`; `likePattern` escapes LIKE wildcards),
`models.ts` [36] (`pageQueryModel` base), `middleware.ts` [22] (`requireRecentReauth`, sends `code: REAUTH_REQUIRED`),
`routes.ts` [25].

**`src/app/metrics/`**: `sources.ts` (`referralSources = ['x']`, `normalizeRefSource`), `models.ts` (`refModel`,
`visitPayloadModel`; `refModel` is also used by `signupPayloadModel`), `controller.ts` (upsert into `referral_visits`).

**`src/app/middlewares/`**: `rate-limit.ts` [119] (`createRateLimiter({name, windowMs, limit, key, failuresOnly})`,
keys `ipKey`/`emailKey`/`userKey`, Redis store with `passOnStoreError` + in-memory fallback, `rateLimits` object at 92,
`closeRateLimitStore`), `request-logger.ts` [72] (`routeOf`, `requestFields` allow-list, `logLevelFor`, `requestLogger`),
`upload-multer.ts` [87] (`AVATAR_MAX_FILE_SIZE` 2 MB, memory storage, magic-byte sniff), `error-handler.ts` [21].

**`src/utils/`**: `api-error.ts` (`ApiError.badRequest/unauthorized/forbidden/notFound/conflict/internal`),
`api-response.ts` (`ok`, `created`), `validate.ts` (`parseOrThrow`, the one error format), `logger.ts` (pino),
`mail.ts` [93] (Resend client at import; `outbox` + `MAIL_TRANSPORT=memory`; `@mail-fails.test` fails on purpose;
one `sendXMail` per email, 50–91), `emails.ts` [174] (`emails.<name>(...)` → `{subject, content}`),
`email-layout.ts` [206] (`EmailContent`, `EmailIcon`, `emailThemes`, `renderEmailHtml` 78, `renderEmailText` 178),
`imagekit.ts` (`uploadImage`, `deleteImage`, lazy client), `device.ts` (`describeDevice(userAgent)`).

**`src/db/`**: `schema.ts` [120], `index.ts` (`db` from `DATABASE_URL`), `migrate.ts` (production migrations).
**`src/scripts/`**: `manage-users.ts` [107] (promote/demote/delete admins; the only path to an admin),
`seed-activity.ts` [157] (dev data, `--clear`).

Env vars (`.env.sample`; prod: `deploy/api.env.sample`): PORT, NODE_ENV, DATABASE_URL, ACCESS_/REFRESH_TOKEN_SECRET_KEY,
ACCESS_/REFRESH_TOKEN_EXPIRY, REDIS_URL, APP_NAME, RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL, IMAGEKIT_PRIVATE_KEY;
test/dev only: MAIL_TRANSPORT, LOG_LEVEL, TEST_DATABASE_URL.

## 4. Data model

`src/db/schema.ts`. Four tables:

| Table (line) | Key columns | Notes |
|---|---|---|
| `users` (8) | id uuid, email unique (322), emailVerified, role `user_role` enum, password (bcrypt), emailVerificationToken/Expiry, resetPasswordToken/Expiry, pendingEmail + emailChangeToken/Expiry, avatarUrl/avatarFileId, accountExistsMailSentAt, signupSource, age | token columns hold sha256 hashes, partial indexes on each. `refresh_token`, `reauthenticated_at` unused (rollback leftovers) |
| `sessions` (60) | id, userId → users cascade, refreshTokenHash unique, userAgent, ipAddress, reauthenticatedAt (sudo mode), lastUsedAt, expiresAt | one row per device; delete row = sign out |
| `audit_events` (86) | action varchar(40), actorId, targetId (no FKs), details jsonb, source 'api'/'cli', ipAddress, requestId | append-only; pruned by retention |
| `referral_visits` (114) | PK (day, source), visits | no IP/user |

Migrations: `drizzle/<timestamp>_<name>/migration.sql` (+ snapshot.json), 15 so far, newest
`20261106074228_small_the_santerians` (signup_source). Config: `drizzle.config.js`.

## 5. Frontend file map

`frontend/` is its own pnpm package. Entry: `src/main.tsx` (browser, `captureReferral()`, preload-error reload) and
`src/entry-server.tsx` (prerender); both render `App` from `src/app.tsx`.

**Routes** (`src/app.tsx` 33; mirror in `frontend/Caddyfile` line 17 `@app`):

| Path | Page file | Guard |
|---|---|---|
| `/` | pages/home.tsx (+ home-copy.ts) | none, prerendered, eager |
| `/sign-up`, `/sign-in` | pages/sign-up.tsx, sign-in.tsx | `GuestOnly` |
| `/verify-email`, `/forgot-password`, `/reset-password`, `/confirm-email` | pages/<same>.tsx | none (email-link targets, `useUrlToken`) |
| `/privacy`, `/terms` | pages/legal.tsx (`PrivacyPolicy` 208, `Terms` 348) | none |
| `/dashboard` | pages/dashboard.tsx | `RequireAuth` |
| `/admin` | pages/admin.tsx | `RequireAuth` → `RequireAdmin` |
| `/dev/emails`, `/dev/oauth-consent` | pages/dev-emails.tsx, dev-oauth-consent.tsx | dev / `VITE_DESIGN_LAB=1` only |
| `*` | pages/not-found.tsx | |

**Inside the big pages** (component → line):
- `dashboard.tsx` [552]: `Dashboard` 27, `ProfileCard` 89 (avatar upload/remove), `EditProfileForm` 217,
  `ChangeEmailForm` 248, `useSessions` ~285, `SessionsCard` 303, `RecentSessions` 351, `DeleteAccountCard` 416,
  `ConnectWebsiteCard` 463, `ChangePasswordCard` 493.
- `admin.tsx` [472]: `Admin` 26, `UsersSection` 62, `ReauthProvider` 145 / `ReauthDialog` 171, `StatTiles` 224,
  `ReferralsCard` 259, `PeriodPicker` 312, `DeleteUserButton` 385, `InviteUserForm` 428. Activity log UI:
  `components/admin-activity.tsx` (`ActivitySection` 112). Data hooks: `lib/admin.ts` (`useAdminData` 28,
  `activityActions` labels 107, `useActivity` 129).
- `home.tsx` [386]: `Hero` 69, `SignInPreview` 110, `Ticker` 139, `Features` 174, `Steps` 203, `Business` 235,
  `Developers` 260, `Pricing` 281, `Faq` 325, `FinalCall` 367. All words: `home-copy.ts`; writing rules:
  `frontend/content/landing-page.md`.
- `legal.tsx` [365]: `UPDATED` date at line 10 (bump on any policy change); Privacy sections 54–203 (what we collect 64,
  cookies 101, sharing 127, retention 147); Terms 230+.

**lib/**: `api.ts` (`ApiRequestError` with `.code`, `User` type 21, `onSessionEnded`, `api`), `auth.tsx`
(`AuthProvider`, `useAuth`: `user`, `reloadUser`, `sessionEnded`), `validation.ts` (`validate*` per field mirroring
models.ts, `PASSWORD_MIN/MAX` 8/72, `parseInvalidFields`, `describeError` 80), `use-form.ts` (`useForm`), `theme.tsx`,
`design-lab.tsx` (`looks`: `guard` + `consent-handshake`, `consent-sentence`), `referral.ts`, `device.ts`, `time.ts`
(`timeAgo`), `password-strength.ts`, `oauth-scopes.ts` (`describeScopes`), `use-url-token.ts`, `use-document-title.ts`.

**components/**: `layout.tsx` (`Layout` 14, `SiteHeader` 77, `SiteFooter` 120, guards 143–162), `auth-shell.tsx`
(`AuthShell`, `badge` prop), `form.tsx` (`TextField`, `PasswordField` with strength, `FormAlert`), `resend-email.tsx`,
`avatar-cropper.tsx`, `avatar-lightbox.tsx`, `user-avatar.tsx`, `user-menu.tsx` (lazy, default export), `pager.tsx`,
`brand.tsx` (`Crest`, `Logo`, `Spinner`), `theme-toggle.tsx`, `design-lab-panel.tsx`, `oauth-consent.tsx`
(`ConsentScreen`), `beta-badge.tsx`, `ui/` (shadcn).

**Build scripts** (`frontend/scripts/`): `prerender.js` (renders `/` → `dist/index.html`, writes `dist/app.html`),
`critical-css.js` (home-page CSS subset), `check-dist.js` (built-site rules, §7), `email-icons.mjs`.
Styles: `src/index.css` (tokens, `.bg-grid`, `.bg-wall`). Head/meta/OG: `frontend/index.html`.

## 6. Change recipes

The files that must move together. Each list is in the order you'd edit them.

**New API endpoint**
1. `src/app/<area>/models.ts`: `<thing>PayloadModel` from the shared field models.
2. `controller.ts`: `handleX` (validate → query → check → act → respond); `recordEvent(tx, …)` if it changes an account.
3. `routes.ts`: limiter from `rateLimits` if it checks a password, mails, or takes a token (add the limiter in
   `middlewares/rate-limit.ts`).
4. New audit action → `auditActions` in `utils/constants.ts` + label in `frontend/src/lib/admin.ts` `activityActions`.
5. `test/<area>.test.ts` (+ `rate-limits.test.ts` for the limiter), break the code once to see it fail.
6. `docs/API.md`: endpoint section, Contents line 12–26, rate-limit table at 112. `frontend/` caller via `api()`.
7. If user-visible: `frontend/index.html` search copy, `legal.tsx` if it stores or shares new data.

**New user column / profile field**: `schema.ts` → `pnpm db:generate` → review SQL → `pnpm db:migrate` →
`user-columns.ts` (if clients may see it) → `models.ts` (`updateProfilePayloadModel`) → `handleUpdateProfile` →
`frontend/src/lib/api.ts` `User` type → `lib/validation.ts` → `dashboard.tsx` `EditProfileForm` / `ProfileCard` →
`legal.tsx` "What we collect" + `UPDATED` → `docs/API.md` (`GET/PATCH /auth/me`) → `test/account.test.ts`.

**New email**: `src/utils/emails.ts` (content) → `email-layout.ts` `EmailIcon` if a new icon → icon SVG in
`frontend/email-icons/` + `frontend/scripts/email-icons.mjs` → PNG in `frontend/public/email/` → `sendXMail` in
`mail.ts` → call it fire-and-forget (`.catch(error => req.log.error(...))`) after the transaction → sample in
`src/app/dev/routes.ts` `samples` → `test/emails.test.ts` + `test/mail-failure.test.ts`.

**New frontend route**: page in `pages/` (with `useDocumentTitle`) → lazy import + route inside the `RouteError`
pathless route in `app.tsx` → `frontend/Caddyfile` `@app` list (check-repo fails otherwise) → if an email links to it,
`docs/API.md` "Frontend pages the emails link to" (150). UI look: `/ui-change` + `design-lab.tsx` `looks`.

**New rate limit**: `rateLimits` entry in `middlewares/rate-limit.ts` → `routes.ts` → `docs/API.md` table (112) and
`docs/DEPLOYMENT.md` "Rate limits" (741) → `test/rate-limits.test.ts`.

**New audit action**: `auditActions` → `recordEvent(tx, …)` in the transaction → retention bucket in
`pruneAuditEvents` (`audit.ts`) if routine → frontend `activityActions` label → `test/activity.test.ts` →
Privacy Policy retention if it changes.

**New referral tag**: `src/app/metrics/sources.ts` `referralSources` → `frontend/src/pages/admin.tsx` `referralNames`.

**New env var**: `.env.sample` → `deploy/api.env.sample` → `docs/DEPLOYMENT.md` (Step 6 at 249, "Changing a setting"
487) → `test/env.ts` if tests need it → put it on the VPS (`/opt/ckauth/api.env`) before the deploy.

**New security header / CSP change**: `deploy/ckauth.caddy` (CSP line 35). Inline script changes need the new
`theme-init.js` hash there (the build prints it).

**Brand image change**: edit the SVG (`frontend/og-image.svg`, `frontend/brand/*.svg`) → `pnpm brand:images` →
commit the PNGs (check-dist compares the embedded SHA-256) → `docs/BRAND.md` "Brand files" (87).

## 7. Tests, checks and CI

**API tests** `test/` (run only via `pnpm test`, narrowed with a pattern; never `tsx --test` directly: it skips
`test/env.ts` and wipes the dev database). Helpers `test/helpers.ts`: `startApp` 17, `resetDatabase` 34, `Client` 46,
`createUser` 127, `signIn` 143, `lastMailTo` 151, `tokenFrom` 158, `findUser` 165, `signUp` 171, `sha256` 177,
`sessionsOf` 182, `mailsTo` 186. Setup: `test/env.ts`, `test/global-setup.ts` (`prepareDatabase`), `test/database-url.ts`.

| Area | File |
|---|---|
| sign-up, sign-in, verify | sign-up, sign-in, verify-email |
| sessions, refresh, devices | session |
| profile, avatar removal, self-delete, resend, change email | account |
| forgot/reset/change password | password |
| avatar upload | upload-avatar |
| every limiter | rate-limits; Redis down: redis-down |
| admin endpoints | admin; audit log: activity; referrals: metrics |
| mail failures don't fail requests | mail-failure; email rendering: emails |
| units | models, jwt-token, error-handler, request-logger; `test.todo` gaps: known-gaps |

**Frontend unit tests** `frontend/test/` (`cd frontend && pnpm test`): api, device, time, validation, oauth-scopes,
critical-css. **Browser tests** `e2e/` (`pnpm e2e`): sign-up.spec, sign-in.spec; `fixtures.ts`, `start-api.ts`,
`playwright.config.ts` (API :8090, preview :4180).

**`pnpm check:pr`** (`scripts/check-pr.js`) runs in order: api build → knip → audit → test types → test:coverage →
web build → web tests → web knip → web audit → `frontend/scripts/check-dist.js` → `scripts/check-repo.js` →
docs-artifact build (`DOCS_STRICT=1`) → no leftover `TODO(human)`.
- `check-repo.js` [83]: secrets in added lines; no `bcryptjs`; every `jwt.verify`/`jwtVerify` names `algorithms`;
  no `res.status(4xx/5xx).json(` in controllers; Caddyfile `@app` = app.tsx routes; schema.ts needs a drizzle/ change;
  warnings: code without DEVLOG, routes/models without API.md, pages/routes without `frontend/index.html`, and
  routes/schema/app.tsx/constants/rate-limit/check scripts without `.claude/CONTEXT.md`.
- `check-dist.js` [133+]: title 50–60 chars with "sign-in", description 140–160, OG tags, one h1, prerendered home,
  empty app.html shell, robots/sitemap, og.png 1200×630, brand PNG hashes, no render-blocking CSS/JS, size budgets
  (`budgets` near line 18: initialJs 127 KiB, homeHtml 19.25 KiB), critical-CSS coverage, no dev pages shipped.

**CI** `.github/workflows/`: `api.yml` / `web.yml` (path filters at line 5) → reusable `deploy.yml` →
`deploy/deploy.sh` on the VPS. `perf.yml` weekly → `scripts/perf/`.

## 8. Docs map

| Question | Doc (line) |
|---|---|
| Endpoint contract, response format, errors, rate-limit table | `docs/API.md`: Basics 28, rate limits 112, email-link pages 150, endpoints 165, metrics 664, admin 687, flows 915 |
| Production, VPS, deploy, rollback, secrets, backups | `docs/DEPLOYMENT.md`: how it works 52, first-time setup 114, everyday ops 453 (deploy 457, rollback 472, settings 487, migrations 540, admins 550, logs 586, restore 612), troubleshooting 718, reference 774 |
| SSH, GitHub deploy keys | `docs/VPS-ACCESS.md` |
| OIDC design (unbuilt) | `docs/OIDC.md`: decisions 24, flow 56, tokens 167, endpoints 217, storage 233, the 33 security rules 245, code impact 305 |
| OIDC build plan and checklist | `TASKS.md` (Active: housekeeping → before OIDC code → build API → testing) |
| A term | `docs/GLOSSARY.md` (sections: web 21, security 70, OIDC 146, database 216, server 258, frontend 312, hosting 352, logs 405, email 435, SEO 449, legal 534) |
| SEO scores, tests, plan | `docs/SEO-AUDIT.md` (tests 49, plan 166) |
| Name, colours, voice, brand files | `docs/BRAND.md` (colours 40, files 87, emails 120) |
| Why something is the way it is | `LEARNINGS.md` (passwords 13, tokens 22, enumeration 39, concurrency 65, uploads 76, tooling 84, testing 127, performance 176, logging 206, SEO 215, frontend UX 237, process 265) |
| When something changed; what's next | `DEVLOG.md` (dated entries, "Next up" 444, "Future scope" 482) |
| Setup, scripts, structure for humans | `README.md` |
| Skills | `.claude/skills/ship/SKILL.md` (commit/PR), `.claude/skills/ui-change/SKILL.md` |

## 9. Current state and traps

**In progress on `feat/oidc-provider` (uncommitted, as of 7 Nov):**
- JWTs pinned to HS256 (`jwt-token.ts`, `middleware.ts`) + a check-repo rule for it; tests in `jwt-token`/`session`.
- Consent-screen UI only, no endpoints: `components/oauth-consent.tsx`, `beta-badge.tsx`, `lib/oauth-scopes.ts`,
  `pages/dev-oauth-consent.tsx`, design-lab looks; tests `frontend/test/oauth-scopes.test.ts`.
- Critical CSS: `frontend/scripts/critical-css.js` + `prerender.js` + check-dist rules + `frontend/test/critical-css.test.ts`.
- **Hindi removed:** `frontend/src/lib/language.tsx` deleted, `home-copy.ts` now exports `homeCopy = en` only, the
  Devanagari `@font-face` gone from `index.css`. CLAUDE.md, `docs/BRAND.md` and `docs/GLOSSARY.md`
  are updated (the glossary keeps Devanagari and `lang` as history, since DEVLOG.md uses them).
- Audit events added for profile edits, photo changes, device sign-outs and email-change requests (§2), with tests in
  `test/activity.test.ts`, labels in `lib/admin.ts`, the table in `docs/API.md` and the Privacy Policy's activity-log line.
- New docs: `docs/OIDC.md`, `TASKS.md`. Next OIDC steps are in `TASKS.md` (home-page JS budget is at 127.0/127 KiB,
  so any new code on the home page's first load fails check-dist).

**Traps:**
- Sign-up writes no audit event on purpose (dropped 6 Nov 2026); every other account change does (§2, Audit column).
- `handleSignin` sends the verification mail again for an unverified user (line ~176), not only sign-up.
- Admin delete mails only verified users; admins can't delete admins or themselves (controller line ~190).
- `/dev/*` exists only when `NODE_ENV !== 'production'`; `/dev/outbox` also needs `MAIL_TRANSPORT=memory`.
- Malformed/oversized JSON returns 500 (known gap, `errorHandler` only knows `ApiError`).
- Production stack lives in `/opt/ckauth`, not `~/Authentication` (that's just a clone) on the VPS.
- The user's dev server is on 8080; use `PORT=8081` for manual runs. Docker commands hang locally: probe ports instead.

## 10. Maintaining this file

Rules learned from building it (the first draft was a plain file list and failed every test task):
- **Index couplings, not files.** The cost is finding every file one change touches; §2 and §6 are the point of this
  file. A new endpoint, table, route or check updates them.
- **Don't repeat CLAUDE.md.** It's loaded every session; duplicated rules cost tokens twice and drift apart.
- **Symbols first, lines second.** Lines are hints; keep the symbol name next to every line number.
- **Say what's stale.** §9 lists docs that disagree with the code, so nobody trusts the wrong one.
- **Test it:** pick a real task, answer "which files?" from this file alone, then grep to see what it missed.

Regenerate the tables:
```bash
grep -nE 'public async handle' src/app/*/controller.ts              # §2 handler lines
grep -nE 'recordEvent\(|send[A-Z][A-Za-z]+Mail\(' src/app/*/controller.ts src/scripts/*.ts   # §2 audit + mail
grep -nE "^### \`" docs/API.md                                      # §2 API.md lines
grep -nE '^export ' -r src frontend/src | sed 's/{$//'              # §3/§5 symbols
grep -nE '^function [A-Z]|^export function [A-Z]' frontend/src/pages/*.tsx   # §5 page sections
grep -nE '^#{2,3} ' docs/*.md LEARNINGS.md DEVLOG.md                # §8 doc lines
git ls-files | xargs wc -l | sort -n | tail -30                     # file sizes
```
