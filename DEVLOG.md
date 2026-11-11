# Dev Log: CKAuth

The project's history, oldest first. Each entry opens with a one-line summary (**In short**), then the details. Terms are explained the first time they appear; the rest are in the [glossary](docs/GLOSSARY.md). Mistakes and the rules learned from them live in [LEARNINGS.md](LEARNINGS.md).

**Stack:** TypeScript · Express 5 · PostgreSQL 17 (in Docker) · Drizzle ORM · Zod · JWT · bcrypt · Resend · Multer + ImageKit

New entries go at the bottom, under a dated heading.

---

## 26–27 Sep 2026 · Foundations
**In short:** the project skeleton, the first database table, and working sign-up and sign-in.

- Set up the repo with pnpm (the package manager), a strict `tsconfig` (TypeScript's settings file, set to catch as many mistakes as possible), an Express app and an HTTP server on port 8080.
- Ran PostgreSQL in Docker and created the first `users` table with Drizzle (the ORM, a library that maps database tables to code): a UUID id (a random, unguessable identifier), names, `age`, a unique `email`, `email_verified`, and `password` + `salt`.
- Built **sign-up** and **sign-in**, with Zod checking the input. Two early mistakes, both fixed later (see LEARNINGS): passwords were hashed with a hand-rolled HMAC-SHA256 plus salt, which is far too fast to be safe, and one version printed the raw password to the console.

## 28 Sep 2026 · Sessions
**In short:** users stay signed in through two tokens kept in cookies.

- Added **JWT access and refresh tokens**: a short-lived token that proves who you are, and a longer-lived one that gets a new access token. Both are stored in `httpOnly` cookies, which page scripts can't read.
- Added the `authenticateToken` middleware (a function Express runs before a route's handler) to check the session on protected routes, and a `refresh_token` column.
- Created `ApiError` and `ApiResponse`, so every error and success response has the same shape.

## 30 Sep 2026 · First hardening pass
**In short:** proper password hashing, one place for errors, and safe duplicate sign-ups.

- **Switched to bcrypt**, a deliberately slow password hash, and dropped the `salt` column (bcrypt stores its own salt).
- Added one central error handler for the whole app.
- Sign-up now inserts with `onConflictDoNothing` on the email's unique constraint (a database rule that no two rows share a value). If two sign-ups for the same email arrive at the same moment, a race condition, the database lets exactly one through.
- Cookie lifetimes now match the token's own expiry time.

## 2–4 Oct 2026 · Email verification
**In short:** new accounts must confirm their email through a link.

- Connected Resend for sending email, with HTML and plain-text versions of each message.
- Verification tokens are 32 random bytes, **stored only as a SHA-256 hash**, and expire after 15 minutes. A database leak would not reveal working links.

## 7–8 Oct 2026 · Full account lifecycle
**In short:** logout, refresh, password reset and password change, all built safely.

- Added logout, refresh, `/me` (the signed-in user's profile), forgot/reset password and change password, plus welcome and reset emails.
- **Refresh tokens are now stored hashed.** A password reset signs out every session; a password change signs out the user's other devices.
- Forgot-password gives the same response whether or not the account exists, so nobody can use it to test which emails are registered.
- Email links now point to `FRONTEND_URL`. A `jwtid` claim (a *claim* is a fact stored inside a JWT; this one is a unique ID) makes every token different, even when two are issued in the same second.
- Sign-in only resends the verification email if the previous link has expired.

## 9 Oct 2026 · Avatars
**In short:** users can upload a profile picture, safely.

- `POST /auth/upload-avatar` checks the session *before* reading the file, then Multer (Express's file-upload middleware) holds the file in memory.
  - Max 2 MB, one file only, JPEG/PNG/WebP.
  - The **real file type is read from the file's first bytes** ("magic bytes"), so a renamed file can't pass as an image.
- The picture is uploaded to ImageKit (an image CDN) first, then the user's database row is locked (`SELECT … FOR UPDATE`, so other requests wait their turn) and updated.
  - If saving to the database fails, the new file is deleted.
  - The old picture is deleted after the switch.
  - No orphaned files (uploads nothing points to any more) are left behind, even with two uploads at once.
- Filenames are random UUIDs, tagged `user:<id>` in ImageKit, so public image URLs don't reveal user IDs.
- Added `.env.sample`, a template of the required environment variables with placeholder values, and stopped git from ignoring it.

## 9 Oct 2026 · Security pass (BREAKING CHANGE)
**In short:** the API no longer reveals who has an account, and nobody can take over an email address they don't own.

- **Sign-up no longer reveals which emails are registered:** it always returns `201 "check your email"`. If the account already exists and is verified, the owner gets an "account already exists" email instead, at most once every 15 minutes.
- **Closed the pre-account takeover gap** (taking over an account by registering it before its real owner). Before, an attacker could register someone else's email with their own password and keep access once the real owner verified it. Now:
  - Sign-in requires a verified email.
  - Verifying requires the sign-up password, and a wrong password cancels the link.
  - Verifying signs out any earlier sessions.
  - `/me` and `/refresh` reject unverified users.
- This changed how clients must behave, so it shipped as a breaking change (an update that can break existing clients until they adapt).

## 9 Oct 2026 · Documentation
**In short:** written docs for people setting up, building against and maintaining the API.

- Added `README.md` (setup, settings, how auth works, known limitations), `docs/API.md` (every endpoint with its requests, responses, errors and typical flows, for frontend developers) and `CLAUDE.md` (conventions and security rules for AI assistants).
- Writing the docs turned up two gaps: **no CORS configuration** (the API can't be called from another website) and **malformed JSON returns 500** instead of 400.

## 21 Oct 2026 · Frontend, hosting and CI/CD
**In short:** a web app for every flow, a production server, and automatic deploys from GitHub.

- **The CKAuth web app** in `frontend/`: a SPA (single-page application, where JavaScript draws each page in the browser) built with React 19 + Vite + Tailwind 4 + React Router, with pages for every flow (sign-up, verify with password, sign-in, forgot/reset, and a dashboard with avatar upload and change password).
  - One `api()` function makes every call: it sends everything to `/api/...` with cookies, and when a protected call gets a 401 it refreshes the session once and retries. If several concurrent calls fail at the same moment, they share one *single-flight* refresh instead of each starting their own.
  - Tokens from email links are read once, then removed from the address bar and browser history.
- **One address in production: `ckauth.chiragdev.com`.** `/api/*` goes to Express and everything else to the SPA. Because both share one origin (scheme + domain + port), the cookies stay first-party (belonging to the site you're on) and CORS isn't needed. Security headers: CSP (which scripts may run), HSTS (always use HTTPS) and `Referrer-Policy: no-referrer`, so tokens in email links never leak to other sites.
- **A shared server.** The Hostinger KVM 2 VPS will host other sites too, so one shared **edge Caddy** (`deploy/edge/`; Caddy is a web server that also works as a reverse proxy, forwarding requests to the right app) owns ports 80/443 and loads one settings file per project. CKAuth's database sits on a private Docker network; only `api` and `web` join the shared `edge` network, under project-prefixed network aliases (`ckauth-api`, `ckauth-web`) so projects can't clash.
- **Docker Compose stack** (`deploy/compose.yml`): Postgres with no public port, the API, and the web container. Database migrations (versioned SQL files that change the schema) run with Drizzle's runtime migrator (`src/db/migrate.ts`), so the `drizzle-kit` dev tool stays out of the production image.
- **Independent deploys** through CI/CD (continuous integration and deployment: automatic checks and releases on every change). Two GitHub Actions workflows, `api.yml` and `web.yml`, each run only when their own folder changes. On a pull request they check the build; on `main` they build a Docker image, push it to GHCR (GitHub's container registry) tagged with the commit SHA (the commit's unique ID), and call the shared `deploy.yml`. That runs `deploy/deploy.sh <service> <sha>` on the VPS over SSH, checking the server's identity against a pinned host key (a known fingerprint, so CI can't be tricked into deploying to an impostor).
  - Steps: apply migrations (API only) → restart only that service → wait for its health check → record which version is live → validate and reload the edge proxy → smoke test (a quick request to confirm the site answers).
  - Running a workflow by hand with an older SHA rolls back that service alone.
- `deploy/setup-vps.sh` prepares a fresh Ubuntu VPS: Docker, a firewall (ufw), fail2ban (bans IPs after repeated failed logins) and unattended upgrades (automatic security updates). It creates two users, `chirag` (admin, `sudo` with a password) and `deploy` (CI only, no `sudo`), and allows SSH by key only, with root login off. `docs/VPS-ACCESS.md` walks through the SSH keys, the `ssh vps` shortcut, a read-only GitHub key on the VPS, and the CI key.
- **Containers run without root powers:** the API as the `node` user and the web container as `nobody` on port 8080. All of them drop every Linux capability (`cap_drop: ALL`; capabilities are the individual pieces of root's power), set `no-new-privileges` (they can't gain powers later), and use read-only filesystems. The edge keeps only `NET_BIND_SERVICE`, the capability it needs to bind ports 80/443.
- The domain moved to **`ckauth.chiragdev.com`**.
- **Renamed the product to CKAuth** (emails, package names, docs). **`EMAIL_FROM` is now required:** there's no fallback to a hard-coded `dsaden.com` address any more, so changing the sending domain is purely a settings change (documented step by step).
- `deploy/backup.sh` dumps the database nightly (`pg_dump`) with 14-day retention. `/opt/ckauth` and `/opt/edge` are shared by `chirag` and `deploy` through the `deploy` group. They're setgid folders (new files automatically belong to the folder's group), so both users can work there.
- `docs/DEPLOYMENT.md` was rewritten as a first-timer's guide: 10 setup steps, each saying what to do, why, and how to check it, followed by day-to-day operations and troubleshooting tables.
- Tested end to end through the real frontend code and the Vite `/api` proxy: 24 checks, including 3 simultaneous 401s sharing one refresh. The migrator built the full schema on an empty database.
- Local fix: `main`'s development database had picked up two migrations from the `microservice-architecture` branch (a `sessions` table, `refresh_token` dropped). They were rolled back by hand.

## 21 Oct 2026 · Load testing, rate limiting and hashing off the main thread
**In short:** simulated heavy traffic and attacks, found three serious problems, and fixed them.

- **Load-tested** (simulating many users at once) on 2 pinned CPU cores, matching the KVM 2, with a stubbed Resend (a fake that accepts emails without sending them). The test used returning users' sessions and real client IPs passed in the `X-Forwarded-For` header, the way a proxy reports the original visitor. Response times below are percentiles: p50 is the typical request, and p95 means 95% of requests were at least that fast. Before the fixes:
  - 500 people online was fine.
  - **2,000 people online collapsed:** p95 of 12 seconds.
  - **32 password-guessing bots took the app down** for real users: p50 of 28 seconds.
  - The API only ever used one of the two cores.
- **Rate limiting** (capping requests per time window), ported from the `microservice-architecture` design: `express-rate-limit` with a Redis store (Redis is a fast in-memory database, so every API process shares the same counts).
  - Limits per IP, per email (failed attempts only) and per user, on every endpoint that checks a password, sends an email or uses a single-use token.
  - The same 429 response for known and unknown emails, so limits don't reveal accounts.
  - It *fails open*: if Redis is down, requests are allowed through rather than blocked, and the error is logged.
  - Redis was added to both compose files, with no saving to disk and a 48 MB memory cap.
- **Native `bcrypt`** instead of `bcryptjs`. Node runs JavaScript on a single main thread (the event loop), so `bcryptjs` froze every request while hashing. The native version hashes on libuv's thread pool (Node's background worker threads), uses both cores, and doesn't block the event loop. The hash format is unchanged, so existing passwords still work.
- **Keep-alive fix.** Keep-alive means reusing one connection for many requests. Node now keeps idle connections for 125 s (`keepAliveTimeout`, with `headersTimeout` at 126 s), and Caddy's upstream pool (its connections to the app) closes them after 60 s, so Caddy never reuses a socket Node has already closed. Before, that race would have caused random 502s (bad gateway) on POSTs.
- **CPU and memory caps** on every container: CKAuth as a whole is capped at about 1.4 GB of RAM, and the API at 1.5 vCPU.
- **After the fixes:**
  - 2,000 people online: p95 of about 100 ms.
  - Sign-ins about 42 per second (was 17); sign-ups about 39 (was 16).
  - One attacker: blocked, while real users keep a p95 of 46 ms.
  - A botnet using real emails: real users slow to about 0.8 s (was 28 s).
  - Memory: the API idles at about 270 MB, about 200 MB of it from loading `drizzle-orm@1.0.0-rc.4`'s Postgres driver.
- **Closed a sign-in timing leak** (a secret revealed by how long a response takes), found by the load test. Unknown emails were answered in about 16 ms and real accounts in about 60 ms, because bcrypt was skipped for unknown emails, so response time revealed who was registered. Sign-in now always runs bcrypt, against a dummy hash for unknown emails: 54.4 ms vs 54.5 ms, with identical responses.
- The API now sets Express's `trust proxy`, so `req.ip` is the visitor's real IP from `X-Forwarded-For` rather than Caddy's, which rate limiting needs. It also drops the `X-Powered-By` header, which advertised Express to attackers.

## 21 Oct 2026 · VPS SSH hardening fix
**In short:** password logins over SSH were still allowed by mistake; now only keys work.

- **SSH password logins were still on.** `setup-vps.sh` wrote its settings to `99-hardening.conf`, but Hostinger's `50-cloud-init.conf` loads first, and `sshd` keeps the *first* value it reads, so Hostinger's "passwords allowed" won. Fixed on the VPS by renaming the file to `00-hardening.conf`; the server now offers `publickey` authentication only.
- `setup-vps.sh` now writes `00-hardening.conf`, removes any old `99-` file, and fails unless the settings actually in force (`sshd -T`) show password and root logins off.
- Installed the GitHub Actions key for the `deploy` user. `docs/VPS-ACCESS.md` Part 3 now uses `ssh -t` with the key in the command, because the old piped version couldn't ask for the `sudo` password.

## 21 Oct 2026 · Edge proxy up
**In short:** the shared proxy is running with a real HTTPS certificate.

- Started the shared edge Caddy on the VPS. It got the Let's Encrypt certificate (free HTTPS certificates, requested over the ACME protocol) for `ckauth.chiragdev.com` (and returned 502 until the app was deployed, as expected).
- **`ACME_EMAIL` was ignored.** Docker Compose's `.env` file only fills `${...}` placeholders inside `compose.yml`; it isn't passed into the container, so Caddy used its default address. `deploy/edge/compose.yml` now passes it through, and the docs no longer suggest `you@example.com`, which Let's Encrypt rejects.
- Chose one shared sending domain, `mail.chiragdev.com`, for every project on the VPS (Resend's free plan verifies one domain). Receiving mail stays off.
- Fixed the failing `Web / check` CI job: `frontend/` now declares `@types/node` (Node's type definitions for TypeScript) itself instead of borrowing the API package's copy.

## 21 Oct 2026 · First production deploy
**In short:** the app is live; one container needed a fix to start under the security restrictions.

- Merged to `main`: the API, database and Redis deployed and are healthy on the VPS.
- **The web container failed its health check.** The official Caddy binary carries a file capability (a Linux capability attached to the program file) that `cap_drop: [ALL]` forbids, so it couldn't start (`operation not permitted`). The web image now removes that capability at build time, and its tmpfs folders (in-memory scratch space in an otherwise read-only container) belong to the non-root user. Both fixes were checked on the VPS under production restrictions before committing.

## 21 Oct 2026 · Web redesign and sign-in on verify
**In short:** verifying your email now signs you in, and the web app has a new look.

- **Verifying an email now signs the user in.** The link plus the sign-up password is the same proof sign-in asks for, so `/auth/verify-email/:token` sets the session cookies. The new refresh token is saved in the same conditional `UPDATE` that marks the email verified (`UPDATE … WHERE … RETURNING`, which changes the row only if it's still unverified and reports whether it did). If two verification requests race, only the winner gets a session.
- Rebuilt the web app on shadcn/ui (copy-in components built on Radix's accessible primitives, styled with Tailwind v4 design tokens, the named colours and sizes the whole UI shares), with an original "walls" theme, a self-drawn crest and a new landing page.
- Light, dark and system themes. `public/theme-init.js` applies the theme before React loads, so the page never flashes the wrong colours. It's a separate file because the CSP blocks inline scripts; fonts are self-hosted for the same reason.
- Forms now check input as you type (mirroring the API's Zod rules), show friendly messages instead of raw validation text, have a show-password button, and check new passwords against a requirement list and a strength meter. New passwords need 8+ characters with a letter and a number in the web app; the API still accepts 6.
- Compared three looks side by side with a temporary, development-only design lab, then chose **Dusk**: a Cinzel display font, ember and steel colours, and pill-shaped buttons. The two losing looks and their fonts were removed; the lab stays for future redesigns (its panel stays hidden until there are two or more looks).
- **The hero (the top of the landing page) is plain shadcn, with no illustrations.** A sky-and-walls drawing with a giant was tried and dropped as too heavy. The hero now pairs the headline with a card that walks a `GET /auth/me` request through the checks `authenticateToken` really runs: authentication (cookie, token, account; failures are 401) and authorization (verified email; failure is 403). The side panel on the auth pages, the closing call to action and the 404 page share a faint background grid. The theme control is a one-click toggle.
- Subtle nods in the copy: walls Maria/Rose/Sina, "104th Cadet Corps", "Year 850", "titan at the gate" in the 429 log line, and 心臓を捧げよ in the footer. No copyrighted art or logos are used.
- **The shadcn CLI imported `cn` from npm** instead of our own `@/lib/utils`, and installed an unrelated package called `cn`. Removed it and fixed the imports.

## 21 Oct 2026 · SEO
**In short:** search engines and link previews can now see the home page, the server answers like a proper website, and a strict audit shows what's left.

- **The home page is prerendered at build time.** Before, every address returned the same empty `<div id="root">` and JavaScript drew the page in the browser. Crawlers that don't run JavaScript (Bing in part, link previews in Slack/LinkedIn/X/WhatsApp, most AI crawlers) saw nothing, and Google only saw the content in its slower second pass. Now `pnpm build` renders `/` in Node (`src/entry-server.tsx` → `scripts/prerender.js`) and the browser *hydrates* it, meaning React takes over the finished HTML.
  - Every other page gets `dist/app.html`, an empty shell; otherwise `/sign-in` would receive the home page's HTML. `main.tsx` hydrates only when the HTML is marked as prerendered for the current address.
  - The theme toggle's label no longer depends on the theme. The prerender can't know a visitor's theme, and React 19 doesn't fix attributes that differ when it hydrates.
  - Checked by hydrating the built page in jsdom (a browser simulated in Node) with React's development build: no mismatches in light mode, dark mode or signed in. Changing one word of the HTML was reported, which proves the check works.
- **The web server now answers like a website, not only an app.** Before, every address fell back to `index.html` with status 200, including `/robots.txt` and misspelled URLs. Search engines call those "soft 404s". Now:
  - `/sign-in` and the other app pages get the shell plus an `X-Robots-Tag: noindex` header (keep out of search results).
  - Real files are served as files.
  - Anything else is a real **404** that still shows the 404 page.
  - Tested against the Caddyfile with Caddy 2.10.
- New files and tags:
  - `robots.txt` blocks only `/api/`, so crawlers can still see the app pages' `noindex`.
  - `sitemap.xml` lists only the home page.
  - A canonical URL and Open Graph/Twitter tags with a 1200×630 preview card (`public/og.png`, drawn from the crest; source `og-image.svg`).
  - `WebSite`/`WebApplication` structured data (JSON-LD). It reuses the meta description, so the two can't drift apart.
- **Strict audit** in `docs/SEO-AUDIT.md`: 64 pass/fail tests. The live site scores 14/100, this build 33, and about 80 after the phase-1 quick fixes. The code isn't the problem. The domain is (registered today, a parked page at the root, no links), there is only one page search engines can show, and nothing is measured.
- Smaller changes:
  - Each page sets its own browser-tab title (`useDocumentTitle`).
  - App pages load on demand. The main bundle went from 155.5 to 149.6 kB gzipped; React, the router and the header's Radix menu are most of what remains.
  - The two fonts on the first screen are preloaded, so they start downloading with the HTML.

## 23 Oct 2026 · Search copy, speed and contrast
**In short:** the home page now says what CKAuth is in search results, appears sooner, and every piece of its text is readable.

- **Search title and description** now lead with the topic: "Secure Email & Password Authentication Demo · CKAuth", plus a 151-character description that ends with "Try it live." They're kept in step with the features (the "Search copy" rule in CLAUDE.md).
- **Repo renamed** from `Authentication` to `ckauth` on GitHub, matching the product and domain; the local and VPS remotes point to the new URL. The README links the live demo.
- **PageSpeed fixes** (mobile, Lighthouse 12, same machine, before → after):
  - *Render-blocking requests* (files the browser must fetch before drawing anything) went from 2 to 0. The theme script is inlined and allowed by its SHA-256 hash in the CSP (the build fails if the hash in `deploy/ckauth.caddy` is stale), and the home page's CSS is inlined.
  - *LCP render delay* (time from having the HTML to showing the main heading) went from ~800 ms to ~100 ms: the hero slides in but no longer fades in from opacity 0.
  - *JavaScript on the landing page* went from 150 to 121 KiB gzip, and *unused JavaScript* from 79 to 56 KiB: the account menu (Radix dropdown + Floating UI) is lazy-loaded, since only signed-in users see it.
  - *Contrast failures* went from 10 to 0, so accessibility went from 96 to 100. The light theme's `--primary` and `--success` are slightly darker, and muted text no longer has opacity modifiers.

## 24 Oct 2026 · A landing page for small business owners, in English and Hindi
**In short:** the home page now speaks to small business owners in India instead of developers, in plain words and in Hindi as well as English.

- **New message.** CKAuth is introduced as "your website's security guard", with features named by what they do for the owner ("Stops anyone guessing passwords") and compared to things they already trust: a bank locker, an ATM PIN, an OTP. The messaging borrows from Devin's and Chai Prep's landing pages (the product as a team member; one clear path; promise the outcome). The full copy and its rules are in `frontend/content/landing-page.md`; the page reads it from `src/pages/home-copy.ts`.
- **New sections:** a demo sign-in screen in the hero (what a shop's customer sees, and what CKAuth checks), a section for web developers linking to the GitHub repo, placeholder pricing (Free, ₹99/month, ₹999/year, shown as "coming soon" under a "free for now" banner) and an FAQ built on `<details>`, so it works without JavaScript. Each answer starts with a short bold reply ("No, never.", "Free for now.") in a faint bubble under the question.
- **Hindi.** An English/हिंदी switch in the header (`lib/language.tsx`) changes the page, menu and footer. The page always renders in English first, so the prerendered HTML hydrates cleanly, then applies a saved choice.
- **Hindi readability.** Devanagari, the script Hindi is written in, at English settings looked small and cramped. The Noto Sans Devanagari font is now bundled, scaled up 12% with `size-adjust` and loaded only when Hindi appears (`unicode-range`). Hindi text also gets taller lines, no letter-spacing, slightly bigger small text and darker grey text.
- **Design.** Chosen from three looks in the design lab (Dusk, Guard and Chai): **Guard**, slate and ember, with Inter for headings. Cinzel, the old all-caps heading font, is gone. The app pages lost their soldier wording ("Enlist", "Take the oath", "Garrison HQ") for plain words, since shop owners land on them straight from the new page.
- **Search copy:** "Secure Website Login for Small Businesses in India · CKAuth" plus a matching description and share image (`og.png`).

## 27 Oct 2026 · A landing page for every website, a Privacy Policy and Terms
**In short:** the home page now speaks to anyone with users to protect, reads more professionally, is built to turn visits into sign-ups, and the site has a Privacy Policy and Terms of Service.

- **Broader audience, same message.** CKAuth is still "your website's security guard", with the same action-first headings and familiar comparisons (ATM PIN, bank locker, OTP). "Customers" and "shop" became "users" and "your website"; where a concrete picture helps, the copy lists a range (a shop, a clinic, a startup, a community) instead of one kind of business. The demo sign-in screen shows `yourwebsite.com` instead of a made-up store.
- **More professional tone.** No emoji, no "cup of chai" pricing line, an "early access" banner instead of a "launch offer", and a new FAQ question, "Who is CKAuth for?".
- **Built to convert** (turn a visit into a sign-up; terms in the [glossary](docs/GLOSSARY.md#growth-and-legal)):
  - One primary call to action everywhere: "Create your free account" (the header says "Get started free").
  - The hero's second button now scrolls to "How it works" instead of to the developer section, so the only way off the first screen is signing up.
  - A reassurance line under the hero and closing buttons answers "what's the catch?": Free during early access · No card required · Ready in under a minute.
  - A "What do you do with my data?" FAQ answer links to the Privacy Policy.
- **Privacy Policy (`/privacy`) and Terms of Service (`/terms`)** in `src/pages/legal.tsx`, lazy-loaded so the landing page's JavaScript doesn't grow, linked from the footer, and added to the `@app` route list in `frontend/Caddyfile` (so they're `noindex`, like the other app screens). The policy describes what the code really does: the stored fields in `schema.ts`, the two `httpOnly` cookies, local storage for theme and language, rate-limit counters (at most an hour), 14-day backups, and the three processors (Hostinger, Resend, ImageKit). It covers the rights India's DPDP Act gives. Neither page has been reviewed by a lawyer yet.
- **Reviewed both pages against the usual checklists** (GDPR, India's DPDP Act and Rules 2025, California's CCPA, standard SaaS terms, and India's IT Rules 2021, which apply because users upload photos) and filled the gaps:
  - **Privacy:** the legal basis for each use, where data comes from, international transfers, a business-transfer clause, "no profiling" (the only automatic decision is a temporary rate-limit block), EU/UK portability, objection and restriction rights, identity checks on requests, links to other sites, a Grievance Officer, and an "In short" summary at the top.
  - **Privacy, accuracy fixes found in the code:** the API accepts an optional `age`, unconfirmed sign-ups are never cleaned up, error logs can include an email address, and ImageKit sees a viewer's IP address when it serves a photo.
  - **Terms:** using CKAuth on behalf of an organisation, an early-access warning, intellectual property and feedback, other services, survival after an account ends, a limited indemnity, a Grievance Officer with the IT Rules' 24-hour and 15-day timelines, 15 days' notice of changes, and a "General" section (notices, whole agreement, severability, no waiver, transfer, force majeure).
- **Consent at sign-up:** a line under the button, "By creating an account, you agree to our Terms of Service and Privacy Policy", with both links opening in a new tab so the form isn't lost. A line rather than a required checkbox, since every extra click costs sign-ups; terms only bind if sign-up says so.
- **Search copy:** "Secure Sign-In and User Accounts for Your Website · CKAuth", with a description ending in "Free, no card. Get started now." The headline didn't change, so `og.png` stays.
- `frontend/content/landing-page.md` was rewritten to match, with a new "Written to convert" section listing the rules above.

## 27 Oct 2026 · Frontend review: UX, accessibility and honest copy
**In short:** a review of the web app against common UX and accessibility standards found a password meter that never worked, a landing page that promised more than the dashboard offers, and several gaps an SPA has to close on purpose; all the frontend findings are fixed. Lessons are in [LEARNINGS](LEARNINGS.md#frontend-ux--accessibility), new terms in the [glossary](docs/GLOSSARY.md#frontend).

- **Password strength meter.** `scorePassword()` had been a placeholder returning "Holding" for every password since the shadcn rebuild. It now scores length first (8 / 12 / 16 / 20 characters), adds a point for three or more character types, takes one off for mostly repeated characters, and gives 0 ("Breached") to one repeated character, a straight run (`abcd`, `4321`) or a password whose letters are a common leaked word (`Password123!`). There's no extra library: zxcvbn would add ~400 KiB.
- **Honest positioning.** The FAQ "Do I need to know how to code?" now says a developer sets CKAuth up today (from the README) and that a no-code way is coming; the business section says CKAuth helps "on your sign-in". The dashboard has a new **Connect your website · Coming soon** card with the setup guide and a "Tell us what you need" email. `content/landing-page.md` has the new copy and a new rule.
- **Deploys no longer break open tabs:** `pages/route-error.tsx` is the router's `errorElement` (inside the layout, so the header stays), and `main.tsx` reloads once on `vite:preloadError`.
- **Header on phones:** "Sign in" is visible again (it was hidden below 640 px), the phone header shows only the one of Sign in / Sign up you aren't on, the language button is icon-only, the controls are 40 px tall, and on 320 px screens the logo shows just the crest, so nothing scrolls sideways. The signed-out buttons render straight away instead of a blank that filled in after two API calls, and sign-in and sign-up no longer wait behind a spinner.
- **Accessibility:**
  - A skip link [A03].
  - `<ScrollRestoration />`, so new pages start at the top.
  - Focus moves to `<main>` after each navigation, and to the new heading when an auth page swaps views ("Check your inbox"; forgot-password got that title too).
  - Hints and password requirements are tied to their input with `aria-describedby`; only the strength word is a live region, so it's no longer read out on every keystroke.
  - The theme button reports its state (`aria-pressed`), and picking the system's own theme goes back to following the system.
  - The hero stats list puts each label before its number for screen readers.
  - The Terms and Privacy links say they open a new tab.
- **Motion:** the reduced-motion rule also sets `animation-iteration-count: 1` (the ticker used to flicker under it), and the ticker pauses on hover or with its own button.
- **Smaller fixes:** pricing highlights Free ("Available now") instead of the unavailable yearly plan; feature cards no longer lift on hover (they aren't links); the dashboard's "Service record" card is now "Profile"; the change-password form carries a hidden username field, so password managers save the new password to the right account.

## 29 Oct 2026 · The docs as one page, and an OpenID Connect plan
**In short:** every doc can now be read, searched and practised from one page, rebuilt from the Markdown after each major change; and the plan for OpenID Connect is written up.

- **`pnpm docs:artifact`** (`scripts/docs-artifact/`) bundles README, API, Conventions (CLAUDE.md), Deployment, VPS access, Glossary, SEO audit, DEVLOG and LEARNINGS into one HTML page with a sidebar, per-doc outlines and search across every doc. It has no dependencies: the Markdown is embedded as JSON and rendered in the browser.
  - **Journey** is a timeline of DEVLOG's dated entries and their "In short" lines.
  - **Practice** turns each LEARNINGS entry into a recall card (what went wrong → fix → rule), filterable by topic.
  - Both are generated from the docs, so they can't drift from them.
- **It checks links between docs.** Every relative link and `#anchor` is resolved with GitHub's heading rules, and its first run found two problems: VPS-ACCESS linked to a DEPLOYMENT heading that no longer exists, and a paragraph had split DEPLOYMENT's "Who logs in" table. Both are fixed.
- **OpenID Connect plan** (a separate page): CKAuth as an OpenID Provider for other apps (authorization code + PKCE on `oidc-provider`), plus Google and GitHub sign-in for CKAuth itself, with account-linking rules, schema, endpoints, build order and five open decisions. Nothing is built yet.

## 2 Nov 2026 · Roles and an admin panel
**In short:** every account now has a role, `user` or `admin`. Admins get a `/admin` page to see, add and delete users, and admins themselves are managed only from the server.

- **A `role` column** on `users`, a Postgres enum (`user_role`: `user`, `admin`) with default `user`. The values live once in `userRolesEnum` (`src/app/auth/utils/constants.ts`); the enum, the Zod models and the script all read them from there. The migration only adds a column with a default, so a rollback is safe.
- **`authorizeRoles(...roles)`** (`auth/middleware.ts`) runs after `authenticateToken`. That middleware already loads the user from the database on each request, so the role is always current and a demoted admin loses access immediately, not when their token expires. `/auth/me` now returns `role`.
- **Admin API** (`src/app/admin/`, mounted at `/admin`, every route behind both middlewares): `GET /stats` (four counts in one query), `GET /users` (paginated, newest first, safe fields only), `POST /users` (creates an already-verified account with a chosen role; a clear `409` on a taken email, since admins can see every account anyway) and `DELETE /users/:id` (also removes the avatar from ImageKit, after the delete). Writes share a per-admin rate limit, because creating a user runs bcrypt.
- **Admins can't delete themselves or each other through the API.** The "not an admin" condition is part of the `DELETE … WHERE`, so a user promoted between a check and the delete can't slip through. Making, demoting and deleting admins is done **out-of-band** with `src/scripts/manage-users.ts`, which ships in the API image (`docker exec ckauth-api-1 node dist/scripts/manage-users.js role you@x.com admin`, from any folder on the VPS). A stolen admin cookie can't lock the real admins out. No `owner`/`superadmin` role for now; if a second admin needs limits, the plan is a rank per role ("act only on lower ranks") rather than special cases.
- **`/admin` page** (`pages/admin.tsx` + `lib/admin.ts`): stat tiles, one card per user with pages, an "add a user" card that opens the form (with a role switch), and a two-click delete. Admin cards are marked "Protected". It's lazy-loaded, behind `RequireAdmin`, and linked from the account menu and the dashboard for admins only. Three layouts were compared in the design lab (a wide table, a side rail, cards); cards won and the other two were deleted.
- The Privacy Policy now lists the account role among stored data.

## 2 Nov 2026 · A test suite, and the pre-PR checks back
**In short:** 78 tests now cover every endpoint, and `pnpm check:pr` runs twelve checks before a pull request. Restoring the checks turned up four vulnerable dependencies, now updated.

- **The test suite** (`test/`) uses Node's built-in runner (`node:test`) through `tsx`, so it adds no test framework. Integration tests drive the real app over HTTP against a separate `ckauth_test` database, which the global setup creates and migrates on every run. Unit tests cover the Zod models, the JWT helpers and the error handler.
  - **No real email:** `MAIL_TRANSPORT=memory` makes `mail.ts` keep mails in an in-memory outbox. Tests read the verification and reset links from it, the way a user would click them.
  - **Real rate limits:** each test client sends its own IP, so per-IP limits behave as they would for separate visitors.
  - What it checks includes the security rules: no account enumeration (same response either way), only hashes stored, single-use links, token rotation, two sign-ups or deletes at once leaving one result, and the admin rules. Breaking the admin delete rule on purpose made exactly one test fail.
  - An unmerged `tests` branch from 8 Oct had a Vitest suite. The cases that still match today's behaviour were ported, so that branch can be deleted.
- **`pnpm check:pr`** (`scripts/check-pr.js`) runs everything and lists all failures at once: both builds, knip (dead code) for the API and the web app, `pnpm audit` for both, the test type check and the tests, the built site's SEO, speed and security rules (`frontend/scripts/check-dist.js`), the repo rules (`scripts/check-repo.js`: secrets, security rules from CLAUDE.md, the Caddyfile route list, files that must change together), docs links, and leftover `TODO(human)` placeholders.
  - The site and repo checks, and the knip configs, were written on 23 Oct but never committed. They survived only in a stash, and are now restored.
  - **Fixed what they found:**
    - four vulnerable packages: `zod` 4.6.7, `multer` 2.5.0, and through Express 5.3.0, `body-parser` 2.4.0 and `qs` 6.17.1;
    - an unused export (`errorMessage`), an unused import, and a `main` field pointing at a file that doesn't exist;
    - `noUnusedLocals` is now on.
  - **Two site checks had gone stale** while they sat in the stash: the title rule still asked for "authentication" (the landing page targets "sign-in" since 27 Oct), and `main` had grown to 127.0 KiB of home-page JavaScript against a 125 KiB budget. The budget is now 127, with the reason written next to it.

## 2 Nov 2026 · Admin hardening, and the test gaps closed
**In short:** checking the admin panel and the tests against industry practice (OWASP's access-control and admin guidance) found seven admin gaps and eight testing gaps. Five admin gaps are fixed here, the audit log is left to the upcoming logs feature, and soft delete was decided against.

- **The API can no longer create admins.** It used to accept `role: "admin"`, so a stolen admin session could create new admins that only the server could remove. Invites are always `user`, and any extra field is a `400`.
- **Invites instead of admin-chosen passwords.** The admin enters a name and email. The person gets a 72-hour link through the existing reset flow, and choosing a password there also verifies the email (a reset link proves the inbox the same way). The admin never knows the password, and nobody can sign in to the account before it's set.
- **Sudo mode.** Inviting and deleting need the admin's password confirmed in the last 15 minutes (`POST /admin/reauth`, limited to 5 wrong tries). A `403` with `"code": "REAUTH_REQUIRED"` makes the page ask for the password and retry. `ApiError` and the error handler gained that optional `code`.
- **Deleted users are told**, by email, if their address was verified.
- **Search** by name or email, with `%` and `_` treated as plain characters.
- **Not done, on purpose:**
  - **Soft delete:** the Privacy Policy promises deletion, and sudo mode makes a mistaken delete much harder.
  - **MFA:** a feature of its own, still in [ROADMAP.md](ROADMAP.md)'s Future scope.
  - **The audit log:** built, then removed, because the logs feature covers it.
- **Tests (103, plus 5 `test.todo`s, one per known gap):**
  - **Coverage minimum:** `pnpm test:coverage` fails below 95% lines, 83% branches and 85% functions. Today it's 97.7 / 85.9 / 87.6.
  - **Tests now run in CI:** `api.yml` runs them against a temporary Postgres before any image is built, and `web.yml` runs the frontend tests.
  - **New areas:** uploads (authenticate before parsing, magic bytes, 413), every rate limit, and the frontend's refresh-on-401 logic.
- **A race test that can fail.** The old "two deletes at once" test would have passed even without the role check. The new one holds a promotion's row lock from a second connection while the delete waits. It fails against a check-then-delete version of the code and passes against the real one.
- **Redis down no longer stalls requests.** The new test found that with Redis unreachable, every rate-limited request waited about 5 s, because node-redis queued the command, before failing open. `disableOfflineQueue: true` brings that to under 100 ms.
- **Security headers are checked after every deploy** (`scripts/check-live-headers.js`, on both `/` and `/api/`). Today's live site passes all of them.
- **Broken links between docs now fail `check:pr`** (`DOCS_STRICT=1`), while `pnpm docs:artifact` on its own still only warns.
- **Checked in a real browser** (headless Chromium through Playwright, against the real app with the in-memory outbox). A 21-step walkthrough passed in light, dark and at phone width: search, the invite and its password prompt (wrong password, cancel with Escape), delete, opening the invite link, choosing a password, signing in, and a non-admin being turned away. It found two problems, both fixed:
  - **The search box was cramped on phones**, so its placeholder was cut off. It now gets its own row.
  - **The password prompt wasn't a real modal:** Tab could reach the page behind it, and nothing hid that page from screen readers. It's now a Radix `Dialog`.

## 2 Nov 2026 · A session per device, and self-serve account basics
**In short:** each device now has its own session, so signing in on a phone no longer signs out the laptop, and signing a device out works at once. People can see their devices, edit their name, remove their photo, resend the confirmation email and delete their own account. Avatars open full size.

- **A `sessions` table** (one row per device: the refresh token's SHA-256 hash, user agent, last IP, created / last used / expiry, and that session's sudo-mode time). `src/app/auth/utils/sessions.ts` starts sessions for sign-in, verify-email and change-password, keeps at most 10 per user (an 11th sign-in drops the one used least recently) and prunes expired ones.
  - **The access token carries the session ID (`sid`),** and `authenticateToken` joins the session row on every request. Ending a session (logout, the device list, a password change or reset, a deleted account) now stops its access token at once, which closes two known gaps (a second device ending the first, and access tokens outliving logout).
  - **Sudo mode moved onto the session,** so confirming the password on one device doesn't unlock admin writes on another.
  - **Rollback-safe:** the migration only adds a table. `users.refresh_token` and `users.reauthenticated_at` stay, unused, so the previous API image still runs; they can be dropped in a later release. **Everyone is signed out once on the deploy** (old tokens have no `sid`), and once more on a rollback.
  - Refresh rotates the token with `UPDATE … WHERE refresh_token_hash = <old>`, so two refreshes racing with the same token can't both win. A reset link is now matched on its token in the same `UPDATE`, so it can't be used twice at once either.
- **New endpoints:** `GET /auth/sessions`, `DELETE /auth/sessions/:id` and `DELETE /auth/sessions` (all but this device); `PATCH /auth/me` (name and age, `.strict()` so it can't touch `email` or `role`); `DELETE /auth/avatar`; `DELETE /auth/me` (needs the password again, 5 wrong tries per 15 min; admins get a `403`, they're removed on the server); `POST /auth/resend-verification` (the same answer for every email, 10 per IP and 3 per email per hour).
- **Sign-up gained a per-email limit** (5 per hour). Before, only the per-IP limit stood between one inbox and many IPs sending it sign-up emails.
- **Frontend:** the dashboard has "Where you're signed in" (browser and system from the user agent, IP, last active, sign out one or all others), name editing, "Remove picture" and a "Delete account" card with the password step. Sign-up's "Check your inbox" has a resend button with a 60 s countdown. Tapping an avatar with a photo, on the dashboard or in `/admin`, opens it full size in a Radix `Dialog`; three viewers are in the design lab (Card, Stage, Zoom) for picking.
- The Privacy Policy and Terms now describe the device list data and self-serve deletion. The "account deleted" email has a variant for deleting your own account.
- **Tests:** 136 pass, plus 3 `test.todo`s for the remaining gaps. Removing the session check from `authenticateToken` on purpose made 4 of them fail.
- **Follow-ups the same day:**
  - **Resend has a 60 s cooldown, with no new column.** Every link lives 15 minutes, so its expiry says when it was sent: a link sent under a minute ago is kept and no mail goes out; after that a still-valid link is replaced. Turning the cooldown off made exactly its test fail.
  - **The dashboard's profile shows more:** age, member since (`/auth/me` now returns `createdAt`), account type, and how many devices are signed in, with a "Manage devices" link to the device list. "Edit profile" opens one form for first name, last name and age. Change password is a button that opens its form in place.
  - **The avatar opens as a big square,** like a profile picture in a messaging app. Three viewers were compared in the design lab (a card with the name under it, a black stage with the name above, and a rounded square that grows out of the avatar). **Zoom won** and the other two were deleted. The `homeHtml` budget is 22.5 KiB: the home page inlines every Tailwind class in the app, and the new dashboard added 0.1 KiB of them.
  - **IPv4 addresses are stored plainly** (`203.0.113.7`, not Node's `::ffff:203.0.113.7`).
  - **Checked in a real browser** (headless Chromium, desktop and 375 px, against the API on a spare port): 30 checks pass, from each viewer opening square, inside the screen, and returning focus on Escape, to the age edit and no sideways scrolling on phones. It found two problems, both fixed: the Cancel buttons needed two clicks (see LEARNINGS), and the page showed through the stage viewer on phones.

## 2 Nov 2026 · A UX pass: explain, confirm, and let people fix things themselves
**In short:** a review of the signed-in experience turned into twelve changes. CKAuth now says why someone was signed out, offers a new verification link wherever one can go missing, confirms what people did, lets them change their email and crop their photo, and emails them about sign-ins from a new browser.

- **"You've been signed out on this device."** `api.ts` reports when a refresh fails for a browser that *had* a session, and the sign-in page says why. `/auth/refresh` now answers `"code": "NO_SESSION"` when there's no refresh cookie at all, so the frontend tells "never signed in" from "signed out" without reading the message text, and a visitor who never signed in sees nothing. The dead cookie is cleared, so the notice shows once.
- **A new verification link wherever one can go missing:** sign-up's inbox screen, sign-in when the email isn't confirmed, and the verify page when a link has expired or was cancelled (which asks for the email, since the link only carries its token). One shared component (`resend-email.tsx`) with the API's 60 s cooldown as a countdown.
- **Smaller fixes:**
  - Each device's "Sign out" button names the device for screen readers.
  - "Profile saved" confirms an edit.
  - Times read "2 hours ago", with the exact time on hover.
  - Deleting your account ends on the home page with a one-time "Your account has been deleted".
- **Change email** (`POST /auth/change-email` with the password, then `POST /auth/confirm-email/:token` from a link to the new address, on a new `/confirm-email` page):
  - The old address is told at once, and again when the change is done.
  - A taken address gets the same response, and a notice instead of a link.
  - Confirming cancels any reset link still in the old inbox, since people often move because they lost that inbox.
  - The page confirms on a button press, never on load, because mail scanners open links.
  - Three nullable columns (`pending_email`, `email_change_token`, `email_change_token_expiry`), so a rollback is safe.
- **New sign-in emails:** when the browser signing in has no other live session on the account, the owner gets its name and IP, with a link to the device list. Signing in again on the same laptop sends nothing.
- **Every mail-sending endpoint is tested with a failing mail** (`test/mail-failure.test.ts`; any `@mail-fails.test` address fails in memory mode), proving CLAUDE.md's "a failed email never fails the request". Making one mail awaited on purpose failed exactly its test.
- **Search copy** now mentions new-device alerts (the description is 152 characters).
- **Admin user cards** show when each user was last active and on how many devices (`lastActiveAt`, `deviceCount`), never the browsers or IPs themselves.
- **Design lab candidates** (pick one each, then delete the other): the device list as **A** "this device and the 3 most recent, then Show all" or **B** "grouped by browser"; the new **photo cropper** with **A** a square frame and a dashed circle guide, or **C** a round mask. The cropper makes a 512 px JPEG in the browser, so a 15 MB phone photo uploads as a few KB and never hits the 2 MB limit.
- **Decided the same day:**
  - **The round crop mask won.** The square-with-guide frame is deleted.
  - **The recent-first device list won** (this device and the 3 most recent, then "Show all"). Grouping by browser is deleted, and the design lab is back to one look, so its panel is hidden.
  - **Age is off the profile again.** It was shown and editable earlier today; now neither. `age` stays in the API (`PATCH /auth/me`, sign-up) and the database, so nothing breaks, but the dashboard no longer invites people to give it. The Privacy Policy no longer lists age among what you can edit.
- **Not done, on purpose:** Hindi past the home page. It needs every app string, the form messages, the API's English errors and the emails translated together, plus a stored language per user, and a review by a Hindi speaker. Half-translated pages would be worse than English. Age stays on the profile, as asked.
- **Checked in a real browser** (25 new checks plus the 30 from before, desktop and 375 px). It found four bugs, all fixed:
  - The cropper said every photo "can't be opened" in development.
  - The account-deleted notice never showed, and the delete actually ended on the sign-in page.
  - The policy's email list read "and and".
  - The admin activity query counted nothing.

## 2 Nov 2026 · Emails: one layout, dark mode, and three designs to choose from
**In short:** every email now shares one layout with a dark mode, icons and the CKAuth shield, and a development-only page shows them all side by side in three candidate designs, in light, dark and an approximation of the Gmail app.

- **Why they looked wrong in dark Gmail:** every template declared `color-scheme: light only` and had no dark styles, and four of the eleven emails were 150-line hand-written copies of the same layout. `mail.ts` went from 1,062 lines to 94: what each email says is in `emails.ts`, how it looks in `email-layout.ts`.
- **Dark mode:** the layout declares `light dark`, and a `prefers-color-scheme: dark` block (plus Outlook.com's `[data-ogsc]`/`[data-ogsb]`) recolours page, card, text, links and dividers. Apple Mail, iOS Mail and Outlook follow it. **Gmail doesn't support it in any app:** the web app shows the light version, and the phone apps recolour light backgrounds and dark text themselves. So the light palette is chosen to survive that, and the icons are images (never recoloured) with their own solid circle.
- **More graphic:** an icon per kind of email in one of three tones (ember for the brand, red for a security warning such as a new sign-in, slate for a plain notice), the shield logo, numbered steps in the welcome mail, and ember buttons instead of indigo, matching the site. The icons come from lucide (`frontend/scripts/email-icons.mjs` → `email-icons/*.svg` → `public/email/*.png`), because Gmail strips SVG.
- **Wording changes:** a few links became buttons: welcome → "Go to your dashboard", account exists → "Sign in" plus "Forgot your password? Reset it here", email change requested → "Reset your password", and the new sign-in mail moved its reset link under the button.
- **Three designs, compared at `/dev/emails`:** **A · Banner** (an ember band with the name), **B · Accent** (the calm card with a coloured stripe and the icon beside the title), **C · Spotlight** (a tinted top with a big centred icon and a pill button). Each shows in light, dark, and a Gmail-app approximation (the light version inverted, images kept), at phone or desktop width.
  - **The page is development only.** The API's `/dev` router is mounted only when `NODE_ENV` isn't `production`, and a test proves it's absent in production. The frontend route exists only in dev builds, and `check-dist.js` now fails a build that ships it.
  - The first try did ship it: the route was gated on the imported `LAB_ENABLED`, which the bundler doesn't fold across modules. Writing `import.meta.env.DEV` in place fixed it.
- **Three colour themes on top** (asked for as "change the theme a little"), switchable on the same page: **Ember** (cool grey page, white card), **Midnight** (the site's slate and ember: a slate banner and headings, a blue-grey page) and **Warm** (cream page, warm off-white card, sand borders, soft brown text). Each has its own dark palette; the brand ember stays the same in all three, because the icons are drawn in it.
- **Spotlight won** the same day; Banner and Accent are deleted, and `/dev/emails` now shows Spotlight in the three themes side by side.
- **Tests:** every theme renders every email with dark mode, each has its own light and dark colours, user-supplied values are escaped, the text part keeps the steps and links, and the preview route works in development and is absent in production (166 API tests).

## 2 Nov 2026 · Cleanup: one copy of each rule, and a performance check
**In short:** a pass for repeated code and leftovers, with no change in behaviour (all 170 API and 21 frontend tests pass), plus a performance review of the request paths.

- **One validation helper.** The six lines that turn a Zod failure into a 400 were pasted into 16 handlers. They're now `parseOrThrow(model, input)` (`src/utils/validate.ts`), the only place that writes the `Invalid input fields: …` message the frontend parses.
- **One list of safe user fields.** `authenticateToken`, the profile update and the admin list each spelled out the same nine columns; they now share `safeUserColumns`, so a new secret column can't leak through a copy that was missed.
- **One token module.** The SHA-256 line was written out five times plus `hashRefreshToken`; `tokens.ts` now holds `hashToken` and `createTempToken` (no longer needlessly `async`), and the admin controller no longer imports from the auth controller.
- **Shared Zod fields:** names, existing and new passwords and link tokens are named models instead of retyped rules.
- **Leftovers removed:** a commented-out `console.log`, about 30 comments that restated the next line, a wrong copy-pasted comment, unnamed `15*60*1000`s, an unused `ApiResponse.noContent`, and `express.static('public')`, which served a folder that doesn't exist. The auth controller went from 886 lines to 763.
- **Frontend:** a `UsernameHint` component replaces four copies of the hidden input password managers need, and the device list's `revoke()` takes one target instead of an array it never used.
- **Performance check:** the token columns used by verify-email, reset-password and confirm-email had no index, so every link click read the whole `users` table. Each now has a partial index (`WHERE … IS NOT NULL`, migration `20261102123652_ambiguous_nova`). It holds only users with a link waiting in their inbox, so it stays small however many accounts there are. Postgres uses it for the handlers' `token = $1` lookups unchanged, since equality implies not null. A plain `CREATE INDEX` briefly blocks writes to `users`, which takes milliseconds at today's size.
  - Everything else on the hot paths already used an index: every signed-in request (including `/auth/me`) is one indexed join, refresh and logout find the session by its unique hash, and the admin list's device counts use `sessions_user_id_idx`.
  - Left for later: admin search's `ilike '%…%'` can't use an index (a trigram index, `pg_trgm`, would fix it once there are many users).

## 2 Nov 2026 · Observability: structured logs and an activity log
**In short:** the API now writes structured logs (one JSON line per request, with a request ID) instead of scattered `console.error` calls, and every account change and admin action is recorded in an **audit log**, shown to admins as an activity table in `/admin`. The admin stats gained a 24-hour / 7-day / 30-day / 1-year switch.

- **Structured logs** ([pino](docs/GLOSSARY.md#logs-and-monitoring) + pino-http, `src/utils/logger.ts`, `src/app/middlewares/request-logger.ts`):
  - One `request completed` line per request: `reqId`, `method`, `route`, `status`, `ms`, `ip`, `userId`. The ID is returned as `X-Request-Id`, so a user can quote it.
  - **Route templates, never URLs:** one-time tokens travel in paths (`/auth/verify-email/:token`), and `/admin/users?search=` holds what an admin typed, so the line names a request by its Express route template. An unmatched path is logged with segments of 32+ characters masked.
  - **An allow-list, plus redaction as a backstop:** pino-http's default serializer logs every header, cookies (the JWTs) included, so it's replaced by six named fields; `redact` still strips `password`, `token`, `cookie`, `authorization` and `body` if someone logs a whole object.
  - **Levels as text** (`"level":"warn"`, not pino's default `40`), which is what Loki, Datadog and OpenTelemetry expect. `logLevelFor` picks one per request: `error` for 5xx, `warn` for 429s and refused `/admin` requests, `debug` for the two `401`s every signed-out visit makes (`/auth/me`, `/auth/refresh`), `info` otherwise. Production runs at `info` (`LOG_LEVEL`).
  - **The 37 `console` calls** became `req.log.error({err, mail, userId}, 'mail failed')` and similar: fixed messages with the details as fields, and **no email addresses**, which the privacy review had flagged on 27 Oct. A 5xx's stack trace goes on the request's own line (`res.err`), so a fault is one line, not two.
  - **Cost:** about 0.5–1 ms per request on an empty route at ~6,000 requests a second; under 2% of a real endpoint.
- **The activity log** (`audit_events`, migration `20261102130423_worthless_lyja`, `src/app/auth/utils/audit.ts`):
  - 12 actions: sign-in (and whether from a new browser), a wrong password for a real account, email verified, password changed or reset (or set from an invite), email changed (keeping the old address), self-delete, admin password confirmed or wrong, invite, admin delete, and `manage-users` role changes and deletes.
  - **Written in the same transaction as the action**, so an action can't happen without its record; a test makes the insert fail and checks the password change rolled back. Five single-statement actions (sign-in, self-delete, email change, invite, admin delete) were wrapped in transactions for this.
  - Actor and target are **plain ids without foreign keys**, so a record outlives the account; a deleted account's email is kept in `details`. Wrong passwords for **unknown** emails aren't recorded: nobody to show them to, and storing the guess would keep data about someone who never signed up.
  - **Retention:** `pruneAuditEvents` runs at start-up and daily: sign-ins, wrong passwords and admin confirmations after 90 days, everything else after a year. The Privacy Policy now states both, and that the old "error log includes your email" line is gone.
  - **`GET /admin/activity`** (filters `?action=`, `?userId=` for everything a person did *or* had done to them) joins names at read time and **never returns IP addresses**, like the users list. Tested at 500,000 rows: every page query under 1 ms; deep pages and the pager's `count(*)` 30–50 ms.
- **`/admin`:** an Activity table (When · Event · a sentence in Details) with an event filter, first names (the email on hover), and the filtered person's name dropped from their own rows; clicking a name or a card's **Activity** button filters to them. Several redesigns were tried in the design lab (a timeline, a feed, a four-column table, burst grouping); the plain table won. The **New users** tile switches between rolling windows (24 h, 7 d, 30 d, 1 y), all counted in the stats query's one pass; `newThisWeek` keeps its name so the deployed web keeps working. The Admins tile lost its "Set on the server" note.
- **`pnpm seed:activity`** fills a development database with six fake users and a month of events that tell small stories (a password-guessing burst, an invite, an email change), and refuses to run in production.
- **Tests:** 199 API tests (29 new: `activity`, `request-logger`, stats windows), coverage 98.2% lines / 88.7% branches; each new guarantee was broken once to watch its test fail.
- **Browser walkthrough** (Playwright on spare ports 8081/3001, a temporary admin, removed afterwards): 15 checks on `/admin` at 1280, 390 and 320 px in light and dark, including an invite through the sudo-mode prompt appearing at the top of the log. It found three phone-width overflows the tests can't see: the users grid (from before this branch) grew to the longest email on the page, the new period picker was wider than a 320 px tile, and the invite confirmation's email couldn't wrap. Fixed with `grid-cols-1`, a 4-column picker that fills its tile, and `break-all` on shown emails. It also caught the seed script dating some of today's events in the future.


## 6 Nov 2026 · Dev tooling: `/ship` and `/ui-change` skills, and a shorter CLAUDE.md

- Added two Claude Code skills (a skill is a saved set of instructions the assistant loads on demand) under `.claude/skills/`. `/ship` finishes a branch (tests, docs, `pnpm check:pr`, docs artifact, commits, PR and merge text) in a fresh, cheaper context, with a stop rule: a failed security check or an irreversible change stops everything, other code problems are reported and not fixed, and docs-only work gets two review rounds. `/ui-change` agrees a UI direction with ASCII sketches first, then builds design-lab looks.
- Trimmed `CLAUDE.md` (24.8 KB to 22.4 KB): the shipping-only Workflow bullets now live in `/ship`, and the SEO known-gaps list points to `docs/SEO-AUDIT.md`, keeping only the rules it doesn't cover.
- Why: a token-usage report showed 97.8% of tokens were cache re-reads, and the commit phase of long sessions was the costliest task (about 29 M tokens at roughly 341k tokens of context per call). Forking that phase into a fresh context avoids paying to re-read the whole session.
- No API or web changes.


## 6 Nov 2026 · Browser end-to-end tests and a weekly speed measurement

- **End-to-end (E2E) tests** with Playwright (a tool that drives a real browser): `pnpm e2e` builds both apps, starts the API on its own `ckauth_e2e` database and the built site, then signs up (reading the verification link from the dev-only `GET /dev/outbox`) and signs in. One test checks that a wrong password and an unknown email give the identical API response and identical on-page message (the no-account-enumeration rule), and it was proven to fail when the unknown-email message was changed. 9 of 9 pass on Chromium, Firefox and a Pixel 7 profile. WebKit needs system libraries installed first (`sudo pnpm exec playwright install-deps webkit`), not yet done here.
- Each test sends its own fake `X-Forwarded-For`, because every browser shares one IP and the per-IP rate limits would otherwise trip during a full run. `test/global-setup.ts` now exports `prepareDatabase(url)` so both suites reuse the same create-and-migrate step.
- **Weekly performance measurement** (`.github/workflows/perf.yml`, Mondays): Chromium loads the home page and `/sign-in` seven times cold, on a desktop profile and on a phone on slow 4G, and times 20 API calls. One line per run goes to `perf-data/results.jsonl` on an orphan `perf-data` branch (so it never touches `main` or triggers a deploy), and `scripts/perf/report.js` turns it into a report with trend charts. Read-only against production. GitHub pauses scheduled workflows after 60 days without a commit to the repo; re-enable it in the Actions tab.
- Why: "no browser end-to-end tests yet" was a known gap, and the SEO audit's speed numbers were one-off lab runs; a weekly series shows whether a deploy made the site slower.
- `package.json` and the lockfile changed, so the API workflow runs on merge (nothing in the image changes). Not done: E2E in CI, and tests beyond sign-up and sign-in.


## 6 Nov 2026 · Counting visits and sign-ups from our own links

- **Referral tags:** the links in our posts end with `?ref=x` (X today). When a page opens with one, `captureReferral()` (`frontend/src/lib/referral.ts`) removes it from the address bar, keeps it in session storage and posts it once per tab to the new `POST /metrics/visit`. `main.tsx` loads that code only when the address has `?ref=`, because adding it to the home bundle pushed it 0.1 KiB over its 127 KiB budget. The API adds one to a daily counter per tag (`referral_visits`: day, source, visits) with a single `INSERT … ON CONFLICT DO UPDATE`, so visits at the same moment all count. No IP, cookie or account is stored with a visit.
- **Sign-ups:** sign-up sends the tag as `ref`, and a new account stores it in `users.signup_source`. Only the insert sets it, so a repeat sign-up keeps the first source (first-touch attribution). `GET /admin/stats` now returns `referrals`: visits, sign-ups and verified accounts per tag over the last 30 days.
- **Only known tags count:** `normalizeRefSource` (`src/app/metrics/sources.ts`) trims and lowercases the tag and matches it against a fixed list; anything else, including non-strings, is dropped, with the same response, and never fails a sign-up. A pattern would let anyone create rows by editing a link. A new place to post needs its tag added to `referralSources` first.
- Tests: `test/metrics.test.ts` (tags, the counter under 20 concurrent visits, sign-up sources, the stats), a rate-limit case, and an E2E test that a tagged link is counted once, leaves the address bar and goes with the sign-up; each was proven to fail once. WebKit still needs its system libraries here.
- `POST /metrics/visit` is limited to 30 per hour per IP. The Privacy Policy (now dated 6 Nov) describes the counters and the stored tag, and no longer says there is no measurement at all; it still uses no analytics service, cookie or pixel.
- Why: the build-in-public posts carry `?ref=x`, but nothing read it, so there was no way to tell whether posts brought sign-ups. Partly covers M02 in the SEO audit.
- Migration `20261106074228_small_the_santerians` adds a nullable column and a new table, so it's backwards-compatible.
- **On `/admin`:** a "Where sign-ups come from" card under the stat tiles, one row per tag (busiest first) with visits, sign-ups, verified and the sign-up rate (sign-ups ÷ visits). A table from `sm` up, a short block per tag on phones. Hidden until a tagged link has been used, and fixed at 30 days (picked over a fifth tile and funnel bars, which hold one tag or make a 5% rate a sliver).

## 6 Nov 2026 · A brand image
**In short:** one picture that shows what CKAuth does, used for link previews, the README and GitHub.

- **The image:** "Every sign-in, guarded." beside a sign-in card and the "new device signed in" alert, with three checks (email-confirmed sign-ups, password guessing blocked, new-device alerts). It replaces the crest-and-slogan card, which named CKAuth but didn't show what it does. Picked over a centred "spotlight" card like the emails and a bold poster. Everything in it is drawn from shapes and real product copy, so there's no illustration and no made-up claim.
- **One source, three outputs:** `frontend/og-image.svg` holds both themes as CSS variables copied from `index.css`. `pnpm brand:images` (`scripts/brand-images.mjs`) renders it in Chromium through the Playwright install the E2E tests already use, with Inter embedded: `public/og.png` (1200×630, dark) and `docs/brand/ckauth-{dark,light}.png` (1280×640). The larger size crops the design slightly (`preserveAspectRatio="xMidYMid slice"`) instead of stretching it.
- **Where it's used:** link previews (dark only, because a preview can't follow the reader's theme), the top of the README (a `<picture>` that follows GitHub's theme) and GitHub's social preview (uploaded by hand). `og:image:alt` describes the new image.
- **App icons:** `public/` had only `favicon.svg`, so an iPhone "Add to Home Screen" showed a screenshot. `brand/icon.svg` (the crest on the navy background, full-bleed, inside the maskable safe zone) now renders `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png`, and `public/manifest.json` lists them for Android. The manifest is `.json`, not `.webmanifest`, so Caddy serves it with a type browsers accept without extra config. Adding the two `<link>` tags put the home page 8 bytes over its 22.5 KiB gzip budget, so their comment went instead of raising the budget.
- **Social profile kit:** `brand/social-header.svg` renders the X header (1500 × 500) and LinkedIn banner (1584 × 396, cropped from the same design), and the icon gives a 400 × 400 avatar, each dark and light, in `docs/brand/social/`.
- **Stale images fail the build:** each PNG stores the SHA-256 of its SVG in a `tEXt` chunk, and `check-dist.js` fails when `og.png` or an app icon doesn't match its current source. File dates can't do this, because a git checkout resets them. Proven to fail once by editing `icon.svg` without re-rendering.
- **Brand guide:** `docs/BRAND.md` covers the name, the crest, colours, type, voice and taglines, imagery, every brand file with where it's used and how to upload it, and the email colours.
- **Email theme picked: midnight,** over ember (cool grey) and warm (cream), after comparing two real emails in all three, light and dark. Its colours are the site's own (the dark card is `--card`, `#111827`), so an email looks like the product. The other two palettes are deleted; `emailThemes` stays a one-entry list, so `/dev/emails` can still compare a new candidate. A new test keeps the emails on the site's slate and card colours, proven to fail once.

## 7 Nov 2026 · The activity log's missing events
**In short:** every change to an account now shows in the activity log.

- **Four new activity-log events:** `profile_updated` (one `true` per field sent, such as `{firstName: true}`, never the new value), `avatar_changed` (`removed` for a removal), `sessions_revoked` (`count`, and whether it was this device) and `email_change_requested`. These account changes wrote nothing, although CLAUDE.md says every one does. Each is written in the transaction that makes the change; the profile edit, device sign-outs and email request were single writes, so they moved into one. Removing a photo that's already gone, or "sign out other devices" with none, records nothing. An email request is recorded the same whether or not the new address is taken, and keeps no address, so the log can't be read as a list of who has an account. Sign-up stays unrecorded, as decided on 6 Nov.
- **Why field names and not values:** the log is kept for a year and admins read it. A name change is a common sign of a takeover, so which field changed is worth keeping; the age or name itself isn't.
- **Tests:** one per event in `test/activity.test.ts` (the profile one checks that only field names are kept), plus a rollback test for the profile edit; the device one proven to fail once by removing its write. Photo uploads can't be tested while ImageKit is off in the tests, so only removal is covered.
- **Policy and docs:** the Privacy Policy's activity-log line lists the new events ("which fields, not what you typed"); `docs/API.md` has them in its actions table; the admin panel's filter has their labels.

## 7 Nov 2026 · Hardening the activity log
**In short:** the activity log can't be rewritten, can't be flooded, and a password change now tells the account owner.

A review of the new events against OWASP's logging guidance, NIST SP 800-92 and 800-63B found nine gaps; these went in now, the rest are in [ROADMAP.md](ROADMAP.md)'s Next up.
- **Append-only, in the database.** Three triggers on `audit_events` refuse every `UPDATE`, and refuse `DELETE`/`TRUNCATE` unless the transaction opted in with `set local ckauth.audit_maintenance = 'on'`, which only `withAuditMaintenance` does (pruning, `seed:activity --clear`, the tests' reset). `set local` ends with the transaction, so the opt-in can't leak onto a pooled connection. A bug or an injected query can no longer rewrite history. Older API images keep working: their pruning is refused and logged. Proven by dropping the triggers in a throwaway database and watching three tests fail.
- **The API has its own database role, `ckauth_api`,** instead of the owner `ckauth` (a superuser in the Postgres image). It can read and write every table, but on `audit_events` only `SELECT` and `INSERT`, and not owning the table it can't drop the triggers. So a leaked API password or code running in the API container can add events but never remove one. Pruning moved into `prune_audit_events()`, a `SECURITY DEFINER` function with no arguments and the retention periods written in, so the API can delete only what was due. `ensure_api_role()` makes the role and its grants; `migrate.ts` runs it on every deploy (roles belong to the Postgres server, so a backup restored onto a new one gets the role back) and sets its password from the new `API_DB_PASSWORD`. Checked with tests that act as the role (what it may and may not do, proven by over-granting it in a throwaway database), a real run of every account flow and `manage-users` as the role on port 8081, and a `check-repo.js` rule that the compose file's API connects as `ckauth_api` (proven once).
- **`PATCH /auth/me` is rate-limited** (30 per hour per user). Each saved edit now writes a row kept for a year, so without a limit one session could fill the table and bury the account's real history.
- **`profile_updated` names only fields whose value changed,** compared against the row locked inside the transaction; saving the same name again records nothing. It used to name every field sent, which didn't match `docs/API.md`.
- **"Your password was changed" email** after a password change or reset (not for an invited user's first password), with a reset link and never the password. Every other security change already mailed the owner. Sent after the commit, fire-and-forget, and covered by `mail-failure.test.ts`.
- **Tests:** limit, no-op save, the notice (and when it isn't sent), the mail failing, and the append-only rules; each new check was broken once and failed. The `/dev/emails` test now compares its count with `emails.ts`, so a new email can't ship without a preview.
- **Docs:** `docs/API.md` (limits, the notice, append-only), `docs/DEPLOYMENT.md` (removing events by hand), the glossary (trigger), the Privacy Policy (the new notice; records can't be edited) and CLAUDE.md.

## 7 Nov 2026 · Lighter home page, Hindi removed

- **Critical CSS:** `frontend/scripts/critical-css.js` inlines only the rules the home page's markup and first-load JavaScript use (`index.html` 22.5 → 19.0 KiB gzip); the full stylesheet is preloaded in the head and linked at the end of `<body>`. `check-dist.js` proves no class lost its style, prints the CSS/markup split and warns before a budget runs out; budgets tightened (first-load JS 127 → 123.25 KiB, home HTML 22.5 → 18.75 KiB).
- **Hindi removed:** the copy, the language switch, `lib/language.tsx`, the Noto Sans Devanagari font and the `:lang(hi)` styles (home JS 127.0 → 123.0 KiB). It cost every visitor though few switched. The Privacy Policy no longer mentions a stored language choice (dated 11 November 2026).
- **Tests:** a quiet reporter (one summary line when everything passes, full detail for failures; `CI=1` gives the full list) and `pnpm test:only <names>` to run chosen files with the same environment and database as `pnpm test`. Critical CSS has its own unit test.
- **Docs:** glossary (lazy rehashing, trickle migration), BRAND, SEO-AUDIT, CLAUDE.md, an "Import an existing user database" idea in [ROADMAP.md](ROADMAP.md)'s Future scope.

## 7 Nov 2026 · A codebase index
**In short:** AI assistants get a map of the code instead of searching it.

- **The index:** `.claude/CONTEXT.md` lists, for each endpoint, its handler, rate limits, model, audit event, emails, frontend caller, test and `docs/API.md` section, plus "change recipes" naming every file one kind of change touches, and what's in progress or stale. The first draft was a plain file list; tried on five real tasks, it found the right files for none of them, because the slow part is finding everything one change touches. CLAUDE.md points to it, and `check-repo.js` warns when routes, the schema, `app.tsx`, the audit actions, the rate limits or the checks change without it (proven once by moving the file away).
- **The activity log's missing events** went out on their own branch first (`fix/audit-events`, see its entry); the index's audit column already lists them. The glossary's Devanagari and `lang` entries now say Hindi was removed.

## 11 Nov 2026 · Repo hygiene: fewer copies, more checks
**In short:** each fact now lives in one place, and `pnpm check:pr` catches the drift that crept in.

- **New `check-repo.js` rules:** (a) a committed doc may not link to or name (as a backticked `.md` path) a local-only file, and `docs:artifact` bundles only committable docs (tracked, or new and not ignored); (b) no `console.` in `src/` outside `src/scripts/` and `migrate.ts`; (c) `docs/API.md`'s rate-limit table must equal the limiters used in every `routes.ts` (endpoint, limit, window, key, failures-only), in both directions, with guards for an empty parse and for routes the parser can't read; (d) the branch is compared with `origin/main` when it exists, because local `main` lagged. Each was proven to fail once and pass after reverting.
- **CLAUDE.md halved** (28.8K to 15.9K characters): the Layout bullets and the Tests paragraph moved word for word into `.claude/CONTEXT.md` section 11, and CLAUDE.md keeps only the rules. The email example now uses `req.log.error`, not `console.error`.
- **One list of known gaps:** README's "Known limitations" (now with Redis fail-open and no MFA); CLAUDE.md, the index, OIDC rule 25 and the known-gaps test point to it.
- **ROADMAP.md** created from this file's "Next up" and "Future scope", so DEVLOG is history only. Eight finished items were struck after checking the code.
- **README:** a "Start here, by what you want to do" table; the stale test count ("103 tests") and an unsafe single-file `tsx --test` command replaced by `pnpm test:only`.
- **Docs page schedule:** `pnpm docs:artifact` prints when the docs page was last published and when the next republish is due (3-day gap), from a local, ignored `published.json`; `--published` records a publish. The `/ship` skill uses it.
- **Docs page rule is change-based:** `--published` also saves a copy of every doc (`published-docs.json`, local, ignored). Each build diffs the docs against it and prints "up to date", "republish now" or "republish due <date>", listing each changed doc with lines added and removed. A change to a contract doc (README.md or docs/API.md, what other developers build against) means republish now; anything else waits for the 3-day gap so small edits batch together.

---

## Lessons
Mistakes and the rules learned from them are kept topic by topic in [LEARNINGS.md](LEARNINGS.md).

## What's next
Plans ("Next up" and "Future scope") are in [ROADMAP.md](ROADMAP.md).
