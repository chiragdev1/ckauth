# CLAUDE.md

Guidance for AI assistants working in this repository. Read this before making changes.

## Project

Authentication REST API: Express 5 + TypeScript (ESM, `nodenext`), PostgreSQL 17 via Drizzle ORM, Zod validation, JWT in `httpOnly` cookies, Resend for email, Multer + ImageKit for avatars. Package manager: **pnpm**.

The product is **CKAuth**, at `https://ckauth.chiragdev.com`. `frontend/` holds its React + Vite + Tailwind app, a separate pnpm package with its own lockfile. Production runs on a Hostinger KVM 2 VPS that also hosts other sites:
- A shared **edge Caddy** (`/opt/edge`, from `deploy/edge/`) owns ports 80/443 for every site and imports one `sites/<project>.caddy` per project.
- CKAuth's site file (`deploy/ckauth.caddy`) proxies `/api/*` (with `/api` stripped) to `ckauth-api` and everything else to `ckauth-web`. That makes it one origin, so no CORS.
- `api` and `web` deploy **independently**: separate images, the `API_TAG`/`WEB_TAG` tags, and the `api.yml`/`web.yml` workflows chosen by path filters, which share `deploy.yml` → `deploy/deploy.sh`.

- Human docs: `README.md` (setup), `docs/API.md` (endpoint contract), `docs/DEPLOYMENT.md` (production), `docs/SEO-AUDIT.md` (strict SEO/traffic tests, scores and the traffic plan), `docs/GLOSSARY.md` (every term the docs use). Docs are written for beginners but stay professional: keep the technical term and explain it on first use, and add new terms to the glossary
- Project history: `DEVLOG.md` (timeline), `LEARNINGS.md` (mistakes → rules)

## Commands

```bash
pnpm build          # type check + compile; run before every commit
pnpm dev            # watch mode on PORT (default 8080)
pnpm db:up          # start Postgres and Redis in Docker
pnpm db:generate    # create a migration after editing src/db/schema.ts
pnpm db:migrate     # apply migrations
cd frontend && pnpm build   # frontend type check + build (also run before every commit if frontend/ changed)
```

`src/utils/mail.ts` creates the Resend client at import, so the server won't start without `RESEND_API_KEY` or `EMAIL_FROM`. No mail domain is hard-coded anywhere; it's always `EMAIL_FROM`. `imagekit.ts` creates its client on first use, so a missing ImageKit key only breaks avatar uploads.

There is no test suite. Verify changes by building, then running the real flow against a local server: start it on a spare port (`PORT=8081 node dist/index.js`) so the user's dev server on 8080 is left alone. Clean up any test users and uploaded files afterwards.

## Layout

- `src/app/auth/routes.ts`: route → middleware → `authController.handleX.bind(authController)`
- `src/app/auth/controller.ts`: `AuthController` class, one `handleX` method per endpoint
- `src/app/auth/models.ts`: Zod schemas named `<thing>PayloadModel`
- `src/app/auth/middleware.ts`: `authenticateToken` (sets `req.user`; rejects unverified users)
- `src/app/middlewares/`: cross-cutting Express middleware (error handler, uploads, `rate-limit.ts`). Every endpoint that checks a password, sends an email or takes a single-use token gets a limiter in `routes.ts`, keyed per IP, email or user; keep `docs/API.md`'s rate-limit table in sync
- `src/utils/`: `ApiError`, `ApiResponse`, `mail.ts`, `imagekit.ts` (third-party clients live here)
- `src/db/schema.ts` → migrations in `drizzle/`; `src/db/migrate.ts` applies them in production
- `frontend/src/lib/api.ts`: the only place that calls `fetch`; `/api` prefix, `credentials: 'include'`, single-flight refresh on 401 for `authed` requests
- `frontend/src/components/ui/`: shadcn components (edit freely, they're ours); `form.tsx` (fields, password reveal and strength), `auth-shell.tsx`, `brand.tsx`. No illustrations: backdrops are CSS only (`.bg-grid`, `.bg-wall` in `index.css`), and any themed art must stay original (no copyrighted art). Colours are tokens in `src/index.css`; `dark:` follows the `.dark` class set by `lib/theme.tsx` and `public/theme-init.js`
- `frontend/src/lib/design-lab.tsx` + `components/design-lab-panel.tsx`: dev-only switcher for comparing candidate designs on the real pages (Alt+1…9, Alt+T, `?look=<id>`). The panel hides while `looks` has one entry. Production always renders the first look
- `frontend/src/pages/home.tsx` + `home-copy.ts`: the landing page, written for anyone running a website or app (examples span shops, clinics, startups and communities) and built to turn visits into sign-ups: one primary CTA, repeated, with the "no card required" reassurance under it. Every word is in `home-copy.ts` in English and Hindi (the `hi` object must match the `en` type); the source copy and its writing rules are in `frontend/content/landing-page.md`. `lib/language.tsx` holds the English/हिंदी choice (English on the first render, for hydration). Hindi uses the bundled Noto Sans Devanagari (`@font-face` in `index.css`) plus the `:lang(hi)` rules there
- `frontend/src/lib/use-form.ts` + `validation.ts`: every form's state, inline errors (mirroring `models.ts`) and API error → field mapping
- `frontend/src/pages/legal.tsx`: the Privacy Policy (`/privacy`) and Terms (`/terms`). Every statement in them describes what the code does today (stored fields, cookies, rate-limit counters, processors, backup retention), so a change to any of those must update the policy in the same change, and bump its date
- `frontend/src/pages/`: one file per route; routes for email links are fixed by the API (`/verify-email`, `/reset-password`, `/sign-in`, `/forgot-password`). Each page sets its tab title with `useDocumentTitle()`
- `frontend/src/app.tsx`: the routes and provider tree, shared by `main.tsx` (browser) and `entry-server.tsx` (build). Every page except home is lazy-loaded. A new route must also go in the `@app` list in `frontend/Caddyfile`, and inside the pathless route that carries `errorElement: <RouteError />` (`pages/route-error.tsx`), so a crash keeps the header. `main.tsx` reloads once on `vite:preloadError` (a tab older than the deploy)
- `frontend/src/components/layout.tsx`: the skip link, `<ScrollRestoration />`, and focus moved to `<main>` on every route change; `AuthShell` moves focus to its heading when a page swaps views. The header renders the signed-out buttons until `/auth/me` answers (never a blank), and on phones shows only the one of Sign in / Sign up you're not on
- **SEO / prerender:** `pnpm build` also renders `/` in Node (`scripts/prerender.js`) into `dist/index.html`, and writes `dist/app.html`, the empty shell every other route gets. So anything the home page renders must work without `window`/`document`, and must render the same on the first client pass: no theme-, auth- or date-dependent markup, since React doesn't fix mismatched attributes when it hydrates. Only `/` is indexed (`public/robots.txt`, `sitemap.xml`); the meta/OG tags are in `index.html`, and `og-image.svg` is the source of `public/og.png`. The build also inlines `public/theme-init.js` into both pages (the CSP allows it by the SHA-256 hash in `deploy/ckauth.caddy`; the build fails with the new hash if they differ) and inlines the CSS into the home page only. Signed-in-only UI that pulls in big libraries (like `user-menu.tsx`) is lazy-loaded
- `Dockerfile` (api image), `frontend/Dockerfile` + `frontend/Caddyfile` (web image: internal static server on :8080, no TLS; app routes → `app.html` + `noindex`, unknown paths → real 404)
- `deploy/compose.yml` (CKAuth stack; `db` only on the `internal` network, `api`/`web` also on the external `edge` network), `deploy/deploy.sh` (runs on the VPS), `deploy/ckauth.caddy` (public routing + security headers), `deploy/edge/` (shared proxy)
- `.github/workflows/api.yml`, `web.yml` → reusable `deploy.yml`

## Conventions

**Handlers.** Express 5 forwards rejected promises, so handlers `throw` instead of calling `next(err)`. Follow the existing order: validate → query → check → act → respond.

```ts
const validationResult = await somePayloadModel.safeParseAsync(req.body)
if(!validationResult.success) {
  throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
}
```

- **Errors:** `throw ApiError.badRequest/unauthorized/forbidden/notFound/conflict/internal(msg)`, or `new ApiError(status, msg)` for other codes (413, 502). Never `res.status().json()` an error directly.
- **Success:** `return ApiResponse.ok(res, message, data)` / `ApiResponse.created(...)`.
- **Signed-in user:** `(req.user as any)?.id`.
- **Database writes:** use `.returning({id: usersTable.id})` and check the row, throwing `ApiError.internal` if it's missing.
- **Imports:** relative and ending in `.js` (ESM), e.g. `'../../utils/api-error.js'`.
- **Style:** match the surrounding file. In the controller: single quotes, no semicolons at the end of statements (some import lines have them), and `if(` with no space. Comments are lowercase and explain *why*, not what.

## Security rules (do not regress)

- **Hash every token before storing it:** `crypto.createHash('sha256')` for random tokens (refresh, verification, reset), and bcrypt for passwords. Use native `bcrypt` (thread pool), never `bcryptjs`: on the main thread, each hash stalls every other request. Use `createTempToken()` (bottom of `controller.ts`) for new tokens.
- **No account enumeration.** Sign-up, sign-in and forgot-password return the same response whether or not the account exists. Explain differences by email, never in the response.
- **Unverified users get no session:** sign-in, `/refresh` and `authenticateToken` return 403. Verifying requires the signup password.
- **Let the database decide races.** Use unique constraints with `onConflictDoNothing`, conditional `UPDATE … WHERE … RETURNING` for check-then-act (e.g. email cooldowns), and `SELECT … FOR UPDATE` in a transaction when replacing a stored value. Never make a network call (email, ImageKit) inside a transaction.
- **Emails are fire-and-forget:** `sendX(...).catch(error => console.error(...))`. A failed email must never fail the request.
- **Uploads:** authenticate before parsing. Trust the file's magic bytes, not the client's mimetype. Use random filenames (no user IDs in public URLs). Clean up uploaded files on every failure path.
- Never log passwords, tokens or secrets.

## Workflow

- **Schema changes:** edit `schema.ts` → `pnpm db:generate` → review the SQL → `pnpm db:migrate`. A change isn't done until the migration is applied, and the migration folder must be committed with it.
- **UI changes:** for any visual redesign or a new page's look, build 2–3 alternatives as design-lab looks (see `design-lab.tsx`) and let the user compare them before committing to one. Afterwards, promote the winner to the defaults and delete the other candidates, keeping the lab itself.
- **API changes:** update `docs/API.md` and the frontend in the same change.
- **Deploys:** migrations run automatically before the new API starts, and rollbacks don't undo them, so keep migrations backwards-compatible. New env vars go in `deploy/api.env.sample` and `docs/DEPLOYMENT.md`, and must be added to `/opt/ckauth/api.env` on the VPS before the deploy that needs them. VPS users: `chirag` (admin, sudo) and `deploy` (CI only, no sudo); root SSH is off. `/opt/ckauth` and `/opt/edge` are setgid folders owned by the `deploy` group, which `chirag` belongs to, so scripts must work whichever of the two owns a file (rename into place, don't `chmod` or `chown`). Settings changes need `docker compose up -d api`, not `restart`. `deploy/backup.sh` is the nightly dump. Containers run as non-root with `cap_drop: [ALL]`, `no-new-privileges` and read-only filesystems where possible, so keep it that way when adding services. The production database has no public port and isn't on the `edge` network. Security headers belong in `deploy/ckauth.caddy`, not in the web container. Breaking changes need a `BREAKING CHANGE:` footer in the commit.
- **Commits:** Conventional Commits (`feat(auth): …`, `fix(auth): …`), with a body explaining *why* for any behaviour or security change. Only commit when the user asks.
- **Search copy:** when a user-visible feature ships (or one is removed), update the search title and description in `frontend/index.html` (and `og:title`/`og:description`; the JSON-LD description is copied from the meta description at build time). Keep the title 50–60 characters with the topic words first, the description 140–160 with a call to action, and both true to what the live site does today. If the headline changes, update `og-image.svg` and re-render `public/og.png` too.
- **After notable changes:** add a dated entry to `DEVLOG.md` (above the `---` before "Lessons") and update its "Next up" (short-term to-dos) and "Future scope" (larger product directions). Add any mistake or lesson to `LEARNINGS.md` under its topic, in the format *what went wrong → fix → **Rule:***.

## Known gaps

- Rate limits fail open: if Redis is unreachable, requests pass (`passOnStoreError`) and the error is logged.
- No CORS middleware (not needed while the frontend is same-origin).
- Malformed or oversized JSON bodies return 500, because `errorHandler` only recognises `ApiError` (body-parser errors carry `status` 400/413).
- Ending a session revokes the refresh token, but access tokens stay valid until they expire (there is no access-token denylist).
- **SEO and traffic** (full list with test IDs in `docs/SEO-AUDIT.md`; this build scores 33/100 on its strict tests):
  - The domain is new (registered 21 Oct 2026), `chiragdev.com` itself is a Hostinger parked page, no sites link in yet, and `/` is the only indexable page.
  - LCP is ~2.2 s in the mobile lab (target 1.8 s); the hero no longer fades in, so what's left is network and font loading.
  - Every anonymous visit logs two 401s (`/auth/me`, then `/auth/refresh`).
  - Contrast passes WCAG AA; keep it that way by not putting opacity modifiers on text.
  - The landing page loads ~121 KiB of JavaScript (gzip), ~56 KiB of it unused there (mostly React Router and Tailwind Merge).
  - `/index.html` answers 200 alongside `/` (only the canonical tag deduplicates them).
  - No CDN, no IPv6, no CAA record, no COOP/CORP; HSTS has no `includeSubDomains`/preload; the CSP still allows inline styles.
  - DMARC is `p=none` with no reports; there's no analytics or uptime monitoring.
  - The prerendered footer year is the build year until the client re-renders, and the `@app` route list in `frontend/Caddyfile` must be kept in sync with `src/app.tsx` by hand.
