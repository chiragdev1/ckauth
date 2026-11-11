# CLAUDE.md

Guidance for AI assistants working in this repository. Read this before making changes.

## Project

Authentication REST API: Express 5 + TypeScript (ESM, `nodenext`), PostgreSQL 17 via Drizzle ORM, Zod validation, JWT in `httpOnly` cookies, Resend for email, Multer + ImageKit for avatars. Package manager: **pnpm**.

The product is **CKAuth**, at `https://ckauth.chiragdev.com`. `frontend/` holds its React + Vite + Tailwind app, a separate pnpm package with its own lockfile. Production runs on a Hostinger KVM 2 VPS that also hosts other sites:
- A shared **edge Caddy** (`/opt/edge`, from `deploy/edge/`) owns ports 80/443 for every site and imports one `sites/<project>.caddy` per project.
- CKAuth's site file (`deploy/ckauth.caddy`) proxies `/api/*` (with `/api` stripped) to `ckauth-api` and everything else to `ckauth-web`. That makes it one origin, so no CORS.
- `api` and `web` deploy **independently**: separate images, the `API_TAG`/`WEB_TAG` tags, and the `api.yml`/`web.yml` workflows chosen by path filters, which share `deploy.yml` → `deploy/deploy.sh`.

- Human docs: `README.md` (setup), `docs/API.md` (endpoint contract), `docs/DEPLOYMENT.md` (production), `docs/VPS-ACCESS.md` (SSH keys, GitHub deploy keys, the deploy user), `docs/SEO-AUDIT.md` (strict SEO/traffic tests, scores and the traffic plan), `docs/GLOSSARY.md` (every term the docs use), `docs/BRAND.md` (name, crest, colours, voice, every brand file and where it's used). Docs are written for beginners but stay professional: keep the technical term and explain it on first use, and add new terms to the glossary
- Project history and plans: `DEVLOG.md` (timeline, history only), `ROADMAP.md` ("Next up" and "Future scope"), `LEARNINGS.md` (mistakes → rules)
- **Before any task, AI assistants read** the `.claude/CONTEXT.md` section it touches, `DEVLOG.md`'s latest entry, `ROADMAP.md`'s "Next up", and the `LEARNINGS.md` topic it touches, then the source (not every doc: they're thousands of lines)
- **Codebase index for AI assistants:** `.claude/CONTEXT.md`. Read the section you need before searching: endpoint → handler → limiter → model → audit → mail → frontend → test, the files each kind of change touches, the traps, and every area in full (§11). Update it when you add an endpoint, table, route or check

## Commands

```bash
pnpm build          # type check + compile; run before every commit
pnpm dev            # watch mode on PORT (default 8080)
pnpm db:up          # start Postgres and Redis in Docker
pnpm db:generate    # create a migration after editing src/db/schema.ts
pnpm db:migrate     # apply migrations
cd frontend && pnpm build   # frontend type check + build (also run before every commit if frontend/ changed)
pnpm brand:images   # render the brand SVGs: og.png, app icons, README banner, social kit (dark + light)
pnpm docs:artifact  # bundle the docs into .docs-artifact/ckauth-docs.html, warn about broken links, say whether the published copy needs a republish (--published records one)
pnpm test           # the test suite (needs Postgres; uses its own ckauth_test database)
pnpm test:only session sign-in   # only those files (test/<name>.test.ts), same env and database as pnpm test; never tsx --test a file directly
pnpm e2e            # browser end-to-end tests (Playwright; needs Postgres; builds both apps first)
pnpm perf           # measure the live site (read-only); pnpm perf:report prints the report. Run weekly by perf.yml
pnpm check:pr       # every pre-PR check: builds, knip, audits, tests, built-site and repo rules, docs links, leftover TODO(human)s
pnpm seed:activity  # dev only, after pnpm build: six fake users and a month of activity-log events; --clear removes them
```

`src/utils/mail.ts` creates the Resend client at import, so the server won't start without `RESEND_API_KEY` or `EMAIL_FROM`. No mail domain is hard-coded anywhere; it's always `EMAIL_FROM`. `imagekit.ts` creates its client on first use, so a missing ImageKit key only breaks avatar uploads.

**Tests** (`test/`, `node:test` through `tsx`; the full setup is in `.claude/CONTEXT.md` §11): integration tests drive the real app over HTTP against its own `ckauth_test` database, with mail kept in memory (`MAIL_TRANSPORT=memory`) and no Redis. Run them only through `pnpm test` or `pnpm test:only <names>`: `pnpm test <file>` doesn't narrow the run, and `tsx --test` on a file skips `test/env.ts` and wipes the dev database. One run at a time (two runs share `ckauth_test` and truncate each other's tables). Call `startApp()` at a file's top level, never in a hook. `pnpm test:coverage` fails below 95% lines / 83% branches / 85% functions, and CI runs it before building an image. A new endpoint or rule gets tests in the same change, and a check that can't fail proves nothing: break the code once and watch the test fail.

For anything the suite can't cover (real emails, ImageKit, the browser), also run the real flow against a local server on a spare port (`PORT=8081 node dist/index.js`) so the user's dev server on 8080 is left alone, and clean up test users and uploaded files afterwards.

## Where things live, and the rules that come with them

The file-by-file map is `.claude/CONTEXT.md` (§3 backend, §5 frontend, §11 every area in full). The rules:

- **API areas** (`src/app/auth/`, `admin/`, `metrics/`): `routes.ts` (route → middleware → `controller.handleX.bind(controller)`), `controller.ts` (one `handleX` per endpoint), `models.ts` (Zod, `<thing>PayloadModel`). `/admin` is guarded once by `router.use(authenticateToken, authorizeRoles('admin'))`; `authorizeRoles` always runs after `authenticateToken`.
- **Sessions:** `startSession()` (`auth/utils/sessions.ts`) is the only way to start one (a `sessions` row per device, max 10); ending a session is deleting its row. Select user fields only through `safeUserColumns` (`user-columns.ts`), never by hand. `userRolesEnum` (`constants.ts`) is the only source of role values.
- **Rate limits:** every endpoint that checks a password, sends an email or takes a single-use token gets a limiter in `routes.ts` (`middlewares/rate-limit.ts`), and `docs/API.md`'s rate-limit table lists it (`check-repo.js` compares them). An endpoint that writes an audit event on every call needs one too, or one session can flood a year-long table.
- **Audit log:** `audit_events` is append-only in the database (triggers, and the API's `ckauth_api` role can only `SELECT`/`INSERT`). Never edit or delete an event except through `withAuditMaintenance` or `prune_audit_events()`; keep that function's retention periods equal to `audit.ts`'s constants; a new append-only table needs its own `REVOKE` in `ensure_api_role()`.
- **Referral tags:** `normalizeRefSource` (`metrics/sources.ts`) is the only way in; unknown tags are dropped, and visits store no IP, cookie or user.
- **Mail:** `MAIL_TRANSPORT=memory` is for tests only; production never sets it. Email icons are PNGs (Gmail strips SVG), and the light palette must survive Gmail's own dark-mode inversion.
- **Dev-only code** (`src/app/dev/`, `/dev/*` pages, the design lab) never ships: dev routes mount only outside production, `check-dist.js` fails a build that contains a dev page, and production always renders the design lab's first look.
- **Frontend:** `lib/api.ts` is the only place that calls `fetch`. Forms use `use-form.ts` + `validation.ts`, which mirror `models.ts`. Every page sets its title with `useDocumentTitle()`. `/confirm-email` confirms only on a button press, never on load (mail scanners open links).
- **New route:** add it inside the pathless route with `errorElement: <RouteError />` in `app.tsx`, and to the `@app` list in `frontend/Caddyfile`. Email-link routes are fixed by the API.
- **Look and feel:** colours are tokens in `src/index.css`; no illustrations (CSS backdrops only) and only original themed art.
- **Home page:** every word is in `home-copy.ts` (English only; a translation must load on demand, not in the first-load bundle). It's prerendered, so it must render without `window`/`document` and the same on the first client pass: no theme-, auth- or date-dependent markup. Never inline the whole stylesheet; when a size budget is tight, read `check-dist.js`'s CSS/markup split before naming a cause. Lazy-load signed-in UI that pulls in big libraries.
- **Privacy Policy and Terms** (`pages/legal.tsx`) describe what the code does today. A change to stored fields, cookies, rate-limit counters, processors or retention updates them in the same change and bumps their date.
- **Admins:** `src/scripts/manage-users.ts`, run on the server, is the only way to make, demote or delete one (see Security rules).

## Conventions

**Handlers.** Express 5 forwards rejected promises, so handlers `throw` instead of calling `next(err)`. Follow the existing order: validate → query → check → act → respond.

```ts
const {email, password} = await parseOrThrow(somePayloadModel, req.body)
```

`parseOrThrow` (`src/utils/validate.ts`) is the only place that formats a validation error. The frontend's `parseInvalidFields` (`frontend/src/lib/validation.ts`) reads its `Invalid input fields: field: message, …` format to put each error on its field, so change the two together. Build new models from the shared field models in `models.ts` (`emailModel`, `firstNameModel`, `lastNameModel`, `existingPasswordModel`) rather than retyping the rules.

- **Errors:** `throw ApiError.badRequest/unauthorized/forbidden/notFound/conflict/internal(msg)`, or `new ApiError(status, msg)` for other codes (413, 502). Never `res.status().json()` an error directly.
- **Success:** `return ApiResponse.ok(res, message, data)` / `ApiResponse.created(...)`.
- **Signed-in user:** `(req.user as any)?.id`.
- **Logging:** `req.log.error({err: error, userId, …}, 'mail failed')` inside a request (it carries the request ID), `logger` elsewhere; never `console` outside the `src/scripts/` CLIs and `migrate.ts`. A fixed lowercase message with the details as fields, so one search finds every case. Name people by `userId`, never by email.
- **Database writes:** use `.returning({id: usersTable.id})` and check the row, throwing `ApiError.internal` if it's missing.
- **Imports:** relative and ending in `.js` (ESM), e.g. `'../../utils/api-error.js'`.
- **Style:** match the surrounding file. In the controller: single quotes, no semicolons at the end of statements (some import lines have them), and `if(` with no space. Comments are lowercase and explain *why*, not what.

## Security rules (do not regress)

- **Hash every token before storing it:** `crypto.createHash('sha256')` for random tokens (refresh, verification, reset), and bcrypt for passwords. Use native `bcrypt` (thread pool), never `bcryptjs`: on the main thread, each hash stalls every other request. Use `createTempToken()` and `hashToken()` (`src/app/auth/utils/tokens.ts`) for new tokens.
- **No account enumeration.** Sign-up, sign-in and forgot-password return the same response whether or not the account exists. Explain differences by email, never in the response.
- **Unverified users get no session:** sign-in, `/refresh` and `authenticateToken` return 403. Verifying requires the signup password. A password reset also verifies (the link proves the inbox), which is how admin invites finish; it never starts a session.
- **Admins are made only out-of-band.** The API can't create, demote or delete an admin (invites are always `user`; `inviteUserPayloadModel` is `.strict()`); only `manage-users` on the server can. Admin writes need sudo mode (`requireRecentReauth`, password confirmed within 15 minutes). Granting a power must be at least as hard as taking it away.
- **Let the database decide races.** Use unique constraints with `onConflictDoNothing`, conditional `UPDATE … WHERE … RETURNING` for check-then-act (e.g. email cooldowns), and `SELECT … FOR UPDATE` in a transaction when replacing a stored value. Never make a network call (email, ImageKit) inside a transaction.
- **Emails are fire-and-forget:** `sendX(...).catch(error => { req.log.error({err: error, mail: 'x', userId}, 'mail failed') })`, after the commit. A failed email must never fail the request.
- **Uploads:** authenticate before parsing. Trust the file's magic bytes, not the client's mimetype. Use random filenames (no user IDs in public URLs). Clean up uploaded files on every failure path.
- Never log passwords, tokens or secrets. Log a request by its route template (`routeOf`), never `req.url`: tokens travel in paths (`/verify-email/:token`). The request logger's fields are an allow-list; don't log whole headers, bodies or user rows.
- **Every action that changes an account or is an admin action records an audit event** in the same transaction (`recordEvent(tx, …)`); never write it after the commit. Record only real changes (a save that changes nothing records nothing) and never the values typed.
- **A password change or reset emails the account** (`sendPasswordChangedMail`), like every other security change (new browser, email change, deletion), so the owner hears about a change they didn't make. An invited user's first password is the exception.

## Workflow

- **Schema changes:** edit `schema.ts` → `pnpm db:generate` → review the SQL → `pnpm db:migrate`. A change isn't done until the migration is applied, and the migration folder must be committed with it.
- **UI changes:** use the `/ui-change` skill: agree the direction with ASCII sketches first, then build looks in the design lab (`design-lab.tsx`), promote the winner and keep the lab.
- **API changes:** update `docs/API.md` and the frontend in the same change.
- **Deploys:** migrations run automatically before the new API starts, and rollbacks don't undo them, so keep migrations backwards-compatible. New env vars go in `deploy/api.env.sample` and `docs/DEPLOYMENT.md`, and must be added to `/opt/ckauth/api.env` on the VPS before the deploy that needs them. VPS users: `chirag` (admin, sudo) and `deploy` (CI only, no sudo); root SSH is off. `/opt/ckauth` and `/opt/edge` are setgid folders owned by the `deploy` group, which `chirag` belongs to, so scripts must work whichever of the two owns a file (rename into place, don't `chmod` or `chown`). Settings changes need `docker compose up -d api`, not `restart`. `deploy/backup.sh` is the nightly dump. The API connects as `ckauth_api` (least privilege), never as the owner `ckauth`; only `migrate` and humans use the owner. Containers run as non-root with `cap_drop: [ALL]`, `no-new-privileges` and read-only filesystems where possible, so keep it that way when adding services. The production database has no public port and isn't on the `edge` network. Security headers belong in `deploy/ckauth.caddy`, not in the web container. Breaking changes need a `BREAKING CHANGE:` footer in the commit.
- **Commit, PR, docs, search copy, docs artifact:** all in the `/ship` skill (`.claude/skills/ship/SKILL.md`), which runs in a fresh Sonnet subagent. Only commit when the user asks; then use `/ship`. When a rule is added here, add its check to `scripts/check-repo.js` or `frontend/scripts/check-dist.js` and prove it fails once.

## Known gaps

The one list is `README.md` → "Known limitations" (CORS, malformed JSON → 500, rate limits failing open, no MFA, e2e coverage, SEO); read it before touching those areas, and remove a gap there (and its `test.todo` in `test/known-gaps.test.ts`, if it has one) once fixed. Two rules to keep while building: no opacity modifiers on text (contrast passes WCAG AA), and the `@app` route list in `frontend/Caddyfile` matches `src/app.tsx` (`check-repo.js` fails otherwise).
