# CKAuth context index

A map for Claude Code: where each thing lives and which files change together, so a task starts by opening the right
3–5 files instead of scanning. **CLAUDE.md holds the rules and is always loaded; this file never repeats it.** Read the
section you need (the index below), then open the files it names.

- **Snapshot:** 7 Nov 2026, `feat/oidc-provider` at `028bcb7`. Line numbers are hints that
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
9. [Traps](#9-traps): things that surprise. Work in progress lives in git (branches, `git log`), not here
10. [Maintaining this file](#10-maintaining-this-file)
11. [Subsystem details](#11-subsystem-details): what each area of the code does, and the test setup, in full (moved from CLAUDE.md)

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

**New rate limit**: `rateLimits` entry in `middlewares/rate-limit.ts` → `routes.ts` → `docs/API.md` table (112; `check-repo.js` fails until it matches) and
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
  no `res.status(4xx/5xx).json(` in controllers; no `console.` in `src/` outside `src/scripts/` and `migrate.ts`;
  docs/API.md's rate-limit table = the limiters in every `routes.ts` (endpoint, limit, window, key, failures-only);
  committed docs never link to or name an ignored (local-only) file, and `build.js` bundles only committed docs;
  compares against `origin/main`; Caddyfile `@app` = app.tsx routes; schema.ts needs a drizzle/ change;
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
| A term | `docs/GLOSSARY.md` (sections: web 21, security 70, OIDC 146, database 216, server 258, frontend 312, hosting 352, logs 405, email 435, SEO 449, legal 534) |
| SEO scores, tests, plan | `docs/SEO-AUDIT.md` (tests 49, plan 166) |
| Name, colours, voice, brand files | `docs/BRAND.md` (colours 40, files 87, emails 120) |
| Why something is the way it is | `LEARNINGS.md` (passwords 13, tokens 22, enumeration 39, concurrency 65, uploads 76, tooling 84, testing 127, performance 176, logging 206, SEO 215, frontend UX 237, process 265) |
| When something changed | `DEVLOG.md` (dated entries, history only) |
| What's next | `ROADMAP.md` ("Next up", then "Future scope") |
| Setup, scripts, structure for humans | `README.md` |
| Skills | `.claude/skills/ship/SKILL.md` (commit/PR), `.claude/skills/ui-change/SKILL.md` |

## 9. Traps

- The home page's size budgets in `frontend/scripts/check-dist.js` are tight (about 0.25 KiB of headroom on 7 Nov 2026):
  new code on the home page's first load can fail the build.
- Sign-up writes no audit event on purpose (dropped 6 Nov 2026); every other account change does (§2, Audit column).
- `handleSignin` sends the verification mail again for an unverified user (line ~176), not only sign-up.
- Admin delete mails only verified users; admins can't delete admins or themselves (controller line ~190).
- `/dev/*` exists only when `NODE_ENV !== 'production'`; `/dev/outbox` also needs `MAIL_TRANSPORT=memory`.
- Production stack lives in `/opt/ckauth`, not `~/Authentication` (that's just a clone) on the VPS.
- The user's dev server is on 8080; use `PORT=8081` for manual runs. Docker commands hang locally: probe ports instead.

## 10. Maintaining this file

Rules learned from building it (the first draft was a plain file list and failed every test task):
- **Index couplings, not files.** The cost is finding every file one change touches; §2 and §6 are the point of this
  file. A new endpoint, table, route or check updates them.
- **Don't repeat CLAUDE.md.** It's loaded every session; duplicated rules cost tokens twice and drift apart.
- **Symbols first, lines second.** Lines are hints; keep the symbol name next to every line number.
- **Only what stays true.** §9 holds traps, never "in progress" notes: those go stale with the next commit (one did, 7–11 Nov 2026).
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

## 11. Subsystem details

Moved here from CLAUDE.md on 11 Nov 2026, word for word, so the file loaded every session holds only the rules (CLAUDE.md →
"Where things live" keeps one line per rule). Read the bullet for the part you're changing.

**Test setup.** (`test/`, Node's built-in `node:test` run through `tsx`, no test framework): one file per area (`sign-up`, `verify-email`, `sign-in`, `session` (incl. the device list), `account` (profile, avatar removal, self-delete, resend, change email), `mail-failure` (every mail-sending endpoint still answers when its mail fails: any address at `@mail-fails.test` fails in memory mode), `password`, `upload-avatar`, `rate-limits`, `admin`, `activity` (every audit event, the rollback guarantee, `/admin/activity`, pruning), `metrics` (referral tags, the visit counter, sign-up sources, the stats' `referrals`), `redis-down`), plus unit tests for the Zod models, JWT helpers, error handler and `request-logger` (route templates, the allow-list, log levels), and `known-gaps.test.ts` (a `test.todo` for each known gap in `README.md` → "Known limitations" that a test can describe). `pnpm test:coverage` fails below 95% lines / 83% branches / 85% functions; CI runs it (`api.yml`, with a Postgres service) before building an image. Frontend unit tests (`frontend/test/`, run by Node directly) cover `validation.ts`, `device.ts`, `time.ts`, `oauth-scopes.ts`, `scripts/critical-css.js` and `api.ts`'s single-flight refresh and session-ended signal. **Browser tests** (`e2e/`, Playwright, `pnpm e2e`; sign-up and sign-in so far, not in CI yet): `playwright.config.ts` starts the API on 8090 through `e2e/start-api.ts` (its own `ckauth_e2e` database made by `prepareDatabase` from `test/global-setup.ts`, `MAIL_TRANSPORT=memory`, no Redis) and `vite preview` on 4180, and runs chromium, firefox, webkit and a Pixel 7 project. `e2e/fixtures.ts` gives each test a fake `X-Forwarded-For` (so per-IP limits don't trip), a fresh `email`, a `verifiedUser` and an `inbox` that reads the dev-only `GET /dev/outbox?to=` (404 unless `MAIL_TRANSPORT=memory`). Every integration test drives the real Express app over HTTP against a separate `ckauth_test` database, which `test/global-setup.ts` creates and migrates; `TEST_DATABASE_URL` overrides it. `test/env.ts` fixes the environment first: `MAIL_TRANSPORT=memory` keeps mails in `outbox` (`src/utils/mail.ts`) so a test reads the link a user would click, no Redis (fresh in-memory rate limits per file), no ImageKit, fixed secrets, `LOG_LEVEL=silent`. Helpers in `test/helpers.ts`: `Client` (cookies, plus its own IP per client so per-IP limits behave), `createUser`, `signIn`, `signUp`, `lastMailTo`, `tokenFrom`, `findUser`, `sessionsOf`. Call `startApp()` at a test file's top level, never inside a hook. Output goes through `test/quiet-reporter.ts`: one summary line when everything passes, full detail for each failure plus the stderr of its file, and every `todo` (known gap) and skipped test by name; `CI=1` (set by GitHub Actions) gives Node's full spec output instead. `pnpm test <file>` does not narrow the run (the file is added to the full glob); use `pnpm test:only`. One test run at a time: two runs (two sessions) share `ckauth_test` and truncate each other's tables. A new endpoint or rule gets tests in the same change, and a check that can't fail proves nothing: break the code once and watch the test fail.

**Layout, area by area.**

- `src/app/auth/routes.ts`: route → middleware → `authController.handleX.bind(authController)`
- `src/app/auth/controller.ts`: `AuthController` class, one `handleX` method per endpoint
- `src/app/auth/models.ts`: Zod schemas named `<thing>PayloadModel`
- `src/app/auth/middleware.ts`: `authenticateToken` (sets `req.user`, including `role`, and `req.sessionId`, read from the database on every request; 401 once the token's session row is gone; rejects unverified users) and `authorizeRoles(...roles)` (403 unless `req.user.role` is listed; always after `authenticateToken`)
- `src/app/auth/utils/sessions.ts`: `startSession(executor, userId, req)` is the only way to start a session (one `sessions` row per device, max 10 per user, the access token carries its `sid`); `setSessionCookies`/`clearSessionCookies`. Ending a session = deleting its row. `user-columns.ts`'s `safeUserColumns` is the one list of user fields a client may see (`req.user`, profile edits, the admin list); select through it, never by hand. `users.refresh_token`/`reauthenticated_at` are unused leftovers kept for rollbacks; sudo mode lives on `sessions.reauthenticated_at`
- `src/app/auth/utils/constants.ts`: `userRolesEnum` (`user`, `admin`) is the single source of the role values; `schema.ts`'s `user_role` Postgres enum and the Zod models are built from it. `PASSWORD_HASH_ROUNDS` lives here too
- `src/app/admin/`: same layout as `auth/` (routes, controller, models, `middleware.ts` with `requireRecentReauth`), mounted at `/admin`; `router.use(authenticateToken, authorizeRoles('admin'))` guards every route. Endpoints: stats, users (paged, `?search=`), `reauth` (sudo mode), invite (`POST /users`, a 72-hour set-password link through the reset flow) and delete (emails a verified user). Admins can't delete themselves or other admins through the API. `GET /activity` reads the audit log (filters `?action=`, `?userId=`; never returns IPs)
- `src/app/metrics/`: `POST /metrics/visit` (no auth) counts visits from our own tagged links (`?ref=x`) in `referral_visits`, one counter per tag per day, with no IP, cookie or user. `sources.ts`'s `referralSources` is the only list of tags and `normalizeRefSource` the only way in: unknown tags are dropped, never stored. Sign-up's optional `ref` sets `users.signup_source` on insert only. The frontend half is `frontend/src/lib/referral.ts` (`captureReferral()` in `main.tsx`)
- **Audit log:** `audit_events` (`schema.ts`), written only through `recordEvent(tx, req, event)` (`src/app/auth/utils/audit.ts`) with the transaction that makes the change, so the row commits or rolls back with it; failures with nothing to roll back (`sign_in_failed`, `admin_reauth_failed`) use `db`. Actions are `auditActions` in `constants.ts`. The table is **append-only in the database**: triggers (`20261107063859_audit_events_append_only`) refuse `UPDATE` always and `DELETE`/`TRUNCATE` outside `withAuditMaintenance` (`audit.ts`; `seed:activity --clear` and the tests' `resetDatabase`, as the owner), and in production the API connects as **`ckauth_api`** (`20261107081824_api_database_role`), which has only `SELECT`/`INSERT` on `audit_events` and can't drop triggers. Pruning calls `prune_audit_events()`, a `SECURITY DEFINER` function with the retention periods written in (keep them equal to `audit.ts`'s constants). `ensure_api_role()` (re)creates the role and its grants; `migrate.ts` runs it on every deploy and sets the role's password from `API_DB_PASSWORD`. Never edit or delete an event any other way, and a new append-only table needs its own `REVOKE` in `ensure_api_role()`. An event that writes on every call needs a rate limit on its endpoint (`PATCH /auth/me` has one for `profile_updated`), or one session can flood a year-long table. Actor and target are plain ids (no foreign keys) so rows outlive accounts; a deleted account's email goes in `details`. `pruneAuditEvents` (90 days for `sign_in`/`sign_in_failed`/`admin_reauth`, a year for the rest; the Privacy Policy states both) runs at start-up and daily from `src/index.ts`. `src/scripts/seed-activity.ts` fakes data for development
- `src/scripts/manage-users.ts` (`pnpm admin …` locally, `docker exec ckauth-api-1 node dist/scripts/manage-users.js …` on the VPS, from any folder; `~/Authentication` there is only a git clone, the stack is `/opt/ckauth`): the only way to make, demote or delete an admin, on purpose (see `docs/DEPLOYMENT.md`, "Admins")
- `src/app/middlewares/`: cross-cutting Express middleware (error handler, uploads, `rate-limit.ts`, `request-logger.ts`: pino-http, mounted first, one line per request at a level from `logLevelFor`, `X-Request-Id` on every response; the error handler hands 5xx errors to it as `res.err`). Every endpoint that checks a password, sends an email or takes a single-use token gets a limiter in `routes.ts`, keyed per IP, email or user; keep `docs/API.md`'s rate-limit table in sync
- `src/utils/`: `ApiError`, `ApiResponse`, `logger.ts` (the one pino logger: JSON lines always, `LOG_LEVEL`, default `info`; `pnpm dev` pipes it through pino-pretty), `mail.ts`, `imagekit.ts` (third-party clients live here). `mail.ts` has a `MAIL_TRANSPORT=memory` switch for the tests; production never sets it
- Emails are three files: `emails.ts` (what each says, as data), `email-layout.ts` (one HTML layout for all, with dark mode: `prefers-color-scheme` plus Outlook's `[data-ogsc]`; Gmail ignores both and recolours on its own, so the light palette must survive inversion) and `mail.ts` (sending). Icons are PNGs in `frontend/public/email/`, rendered from `frontend/email-icons/*.svg`, which `frontend/scripts/email-icons.mjs` builds from lucide (Gmail strips SVG). The design is "spotlight" (a tinted top with a big centred icon and title, a pill button); the colour theme is `midnight` (the site's own slate and ember, picked 6 Nov 2026); `emailThemes` stays a list so a new candidate can be compared on `/dev/emails`
- `scripts/perf/` (`measure.js`, `report.js`) + `.github/workflows/perf.yml`: weekly real-world speed measurement of production, results on the orphan `perf-data` branch; read-only against production
- `src/app/dev/routes.ts`: development-only routes (email previews, and `/dev/outbox` for the browser tests), mounted only when `NODE_ENV` isn't `production`; `frontend/src/pages/dev-emails.tsx` (`/dev/emails`) shows them. `check-dist.js` fails a build that ships it, and `check-repo.js` leaves `/dev/` routes out of the Caddyfile comparison
- `frontend/src/components/oauth-consent.tsx`: the Sign in with CKAuth consent screen (`docs/OIDC.md`, step 4), drawn in `AuthShell` with its `badge` prop. The shipped design is the card; `consent-handshake` and `consent-sentence` stay in the design lab as alternatives. `lib/oauth-scopes.ts`'s `describeScopes` turns scopes into rows (fixed order, throws on an unknown scope). `beta-badge.tsx` (`BetaBadge` + `BetaNote`, the explaining line) goes on every OIDC page and nowhere else. `pages/dev-oauth-consent.tsx` (`/dev/oauth-consent`, beside `/dev/emails`) previews it with sample apps until the `/oauth` endpoints exist; `check-dist.js` fails a build that ships it
- `src/db/schema.ts` → migrations in `drizzle/`; `src/db/migrate.ts` applies them in production
- `frontend/src/lib/api.ts`: the only place that calls `fetch`; `/api` prefix, `credentials: 'include'`, single-flight refresh on 401 for `authed` requests
- `frontend/src/components/resend-email.tsx`: "resend the verification email" (sign-up's inbox screen, unverified sign-in, expired verify link), with the API's 60 s cooldown as a countdown. `avatar-cropper.tsx`: crops a picked photo (up to 15 MB) to a 512 px JPEG in the browser before upload, behind a round mask (the corners are still saved, dimmed, for the square full-size viewer). `lib/time.ts` (`timeAgo`) for relative times
- `frontend/src/lib/api.ts`'s `onSessionEnded`: fires when a refresh fails for a browser that had a session (anything but `"code": "NO_SESSION"`); `auth.tsx` turns it into `sessionEnded`, which the sign-in page explains
- `frontend/src/components/avatar-lightbox.tsx`: every avatar that may have a photo (dashboard, `/admin`); with a photo it's a button opening a Radix `Dialog` that grows the photo into a big rounded square (tap anywhere or Escape closes it)
- `frontend/src/components/ui/`: shadcn components (edit freely, they're ours); `form.tsx` (fields, password reveal and strength), `auth-shell.tsx`, `brand.tsx`. No illustrations: backdrops are CSS only (`.bg-grid`, `.bg-wall` in `index.css`), and any themed art must stay original (no copyrighted art). Colours are tokens in `src/index.css`; `dark:` follows the `.dark` class set by `lib/theme.tsx` and `public/theme-init.js`
- `frontend/src/lib/design-lab.tsx` + `components/design-lab-panel.tsx`: dev-only switcher for comparing candidate designs on the real pages (Alt+1…9, Alt+T, `?look=<id>`). The panel hides while `looks` has one entry. Production always renders the first look
- `frontend/src/pages/home.tsx` + `home-copy.ts`: the landing page, written for anyone running a website or app (examples span shops, clinics, startups and communities) and built to turn visits into sign-ups: one primary CTA, repeated, with the "no card required" reassurance under it. Every word is in `home-copy.ts` (English only; Hindi was removed on 7 Nov 2026, and a translation that comes back must load on demand, not in the first-load bundle); the source copy and its writing rules are in `frontend/content/landing-page.md`
- `frontend/src/lib/use-form.ts` + `validation.ts`: every form's state, inline errors (mirroring `models.ts`) and API error → field mapping
- `frontend/src/pages/legal.tsx`: the Privacy Policy (`/privacy`) and Terms (`/terms`). Every statement in them describes what the code does today (stored fields, cookies, rate-limit counters, processors, backup retention), so a change to any of those must update the policy in the same change, and bump its date
- `frontend/src/pages/admin.tsx` + `lib/admin.ts`: the `/admin` page (stat tiles, the referral card (hidden until a `?ref=` tag has a visit; tag names in `referralNames`), search, one card per user, an "invite a user" card that opens the form, two-click delete) behind `RequireAdmin` (`layout.tsx`, inside `RequireAuth`). `ReauthProvider` there catches `REAUTH_REQUIRED` (`ApiRequestError.code`), asks for the password once in a Radix `Dialog` (focus trap, scroll lock, focus return) and retries the action. `reset-password.tsx` shows "Choose your password" for `&invite=1` links
- `frontend/src/pages/`: one file per route; routes for email links are fixed by the API (`/verify-email`, `/reset-password`, `/sign-in`, `/forgot-password`). `/confirm-email` (email change) confirms only on a button press, never on load, because mail scanners open links. Each page sets its tab title with `useDocumentTitle()`
- `frontend/src/app.tsx`: the routes and provider tree, shared by `main.tsx` (browser) and `entry-server.tsx` (build). Every page except home is lazy-loaded. A new route must also go in the `@app` list in `frontend/Caddyfile`, and inside the pathless route that carries `errorElement: <RouteError />` (`pages/route-error.tsx`), so a crash keeps the header. `main.tsx` reloads once on `vite:preloadError` (a tab older than the deploy)
- `frontend/src/components/layout.tsx`: the skip link, `<ScrollRestoration />`, and focus moved to `<main>` on every route change; `AuthShell` moves focus to its heading when a page swaps views. The header renders the signed-out buttons until `/auth/me` answers (never a blank), and on phones shows only the one of Sign in / Sign up you're not on
- **SEO / prerender:** `pnpm build` also renders `/` in Node (`scripts/prerender.js`) into `dist/index.html`, and writes `dist/app.html`, the empty shell every other route gets. So anything the home page renders must work without `window`/`document`, and must render the same on the first client pass: no theme-, auth- or date-dependent markup, since React doesn't fix mismatched attributes when it hydrates. Only `/` is indexed (`public/robots.txt`, `sitemap.xml`); the meta/OG tags are in `index.html`, and the brand images are SVG sources rendered by `pnpm brand:images` (`scripts/brand-images.mjs`, Chromium through Playwright, so CSS variables and Inter work; `class="light"` switches the theme): `og-image.svg` → `public/og.png` (link previews, dark) and `docs/brand/ckauth-{dark,light}.png` (README banner, GitHub social preview); `brand/icon.svg` → `public/apple-touch-icon.png`, `icon-{192,512}.png` (in `public/manifest.json`) and the social avatars; `brand/social-header.svg` → the X and LinkedIn headers in `docs/brand/social/`. Each PNG stores its source's SHA-256 in a `tEXt` chunk, and `check-dist.js` fails when `og.png` or an app icon is older than its SVG. `docs/BRAND.md` lists them all. The build also inlines `public/theme-init.js` into both pages (the CSP allows it by the SHA-256 hash in `deploy/ckauth.caddy`; the build fails with the new hash if they differ) and inlines into the home page only the CSS it uses (critical CSS, `scripts/critical-css.js`): the rules whose classes appear in its markup or first-load JS. The full sheet is preloaded in `<head>` and linked at the end of `<body>`; module scripts wait for it, so React hydrates only once every class is styled, which is what keeps lazy UI (the user menu) and in-app navigation styled. `check-dist.js` fails if a class in the home markup lost its rule, or the full sheet isn't linked or preloaded, and prints the page's CSS/markup split. When a budget is tight, read that split before naming a cause, and never inline the whole sheet again. Signed-in-only UI that pulls in big libraries (like `user-menu.tsx`) is lazy-loaded
- `Dockerfile` (api image), `frontend/Dockerfile` + `frontend/Caddyfile` (web image: internal static server on :8080, no TLS; app routes → `app.html` + `noindex`, unknown paths → real 404)
- `deploy/compose.yml` (CKAuth stack; `db` only on the `internal` network, `api`/`web` also on the external `edge` network), `deploy/deploy.sh` (runs on the VPS), `deploy/ckauth.caddy` (public routing + security headers), `deploy/edge/` (shared proxy)
- `.github/workflows/api.yml`, `web.yml` → reusable `deploy.yml`
