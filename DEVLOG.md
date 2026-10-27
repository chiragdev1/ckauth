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

---

## Lessons
Mistakes and the rules learned from them are kept topic by topic in [LEARNINGS.md](LEARNINGS.md).

## Next up
Short-term work, roughly in order. Bracketed IDs such as [B01] point to tests in [docs/SEO-AUDIT.md](docs/SEO-AUDIT.md).

- **SEO phase 1:**
  - Deploy the general landing page and its search copy (27 Oct) [O01, O02]. Re-run the SEO audit against it: the page now targets "secure sign-in and user accounts for your website" [O03].
  - Have a lawyer review the Privacy Policy and Terms, and confirm the operator and Grievance Officer name, the ₹1,000 liability cap, and a city for "Governing law" (it says only "the courts of India").
  - Make the policy's retention promises concrete: delete unconfirmed sign-ups after a fixed period (e.g. 30 days), and rotate logs with a stated period.
  - Check that open and click tracking is off for the sending domain in Resend; then the policy can say emails aren't tracked.
  - Self-serve account basics from the frontend review (each needs an API endpoint, a rate limiter, `docs/API.md` and, where data changes, the Privacy Policy): a "Resend the email" button on "Check your inbox" (today a resend means signing up again), editing your name, and "Sign out everywhere".
  - Check the new header at 320, 360 and 390 px in a real phone or DevTools, and the skip link, focus moves and ticker pause with a screen reader (VoiceOver or NVDA); the review fixes were built and prerendered but not yet tried in a browser.
  - Build the "Connect your website" flow the dashboard now announces (see Future scope, "Hosted sign-in for other apps"); until it ships, keep the FAQ saying a developer sets CKAuth up.
  - Let users delete their own account (the Privacy Policy promises deletion on request; today it's done by hand). Add log rotation so "server logs are kept only as long as needed" has a number.
  - Count the sign-up funnel (visit → sign-up → verified) once analytics exist, to measure the conversion changes. If analytics are added, update the Privacy Policy, which says there are none.
  - Replace the placeholder pricing with real plans before taking payments, and build or drop the paid-plan features it lists (priority email help, the shop's name on login emails, early access).
  - Translate the app pages (sign-up, sign-in, emails) into Hindi, so the language choice carries past the home page.
  - Verify `chiragdev.com` in Google Search Console and Bing Webmaster Tools (DNS TXT records cover every subdomain), submit `sitemap.xml`, request indexing, and check with Google's Rich Results Test [C10, C11]. Add an IndexNow ping to `deploy.sh` [C12].
  - Replace the Hostinger parked page on `chiragdev.com` with a portfolio that links to CKAuth [D02].
  - LCP is still ~2.2 s in the mobile lab [P02]: next steps are a smaller first-screen font load and a CDN [P09].
  - Stop the `/auth/me` + `/auth/refresh` 401 errors on every visit by a signed-out user [B01].
  - Add a CAA record, an AAAA (IPv6) record, COOP/CORP headers and a `/index.html` → `/` redirect [B06, P12, B07, C07].
  - Set the GitHub repo's homepage, description and topics; link the repo and API docs from the footer; add Person JSON-LD with `sameAs`; add PNG icons and a `site.webmanifest` [D05, O11, O08, O09].
  - Self-host Umami analytics, add an external uptime check, count the sign-up funnel, and extend the domain registration to 2+ years with auto-renew [M01–M03, D08].
  - Add a DMARC report address (`rua`) now and move to `p=quarantine` after 2–4 clean weeks; register `mail.chiragdev.com` in Google Postmaster Tools [D07].
  - Launch posts: Show HN, r/node, r/webdev, dev.to, LinkedIn [M05].
- **SEO phase 2 (months 1–3):** two articles a month on `chiragdev.com/blog` based on LEARNINGS, cross-posted with canonical links, to earn the first links from other sites [O06, D03].
- **SEO phase 3 (months 3–12):** API docs as site pages [O06]; landing-page JavaScript under 100 kB gzipped and critical CSS inlined [P03, P06–P08]; listings on curated "awesome" lists; a monthly Search Console review [M04]; HSTS `includeSubDomains` + preload once every subdomain is HTTPS-only [B03].
- First production deploy to the VPS (follow `docs/DEPLOYMENT.md`).
- Move the sender to a CKAuth-branded domain (only `EMAIL_FROM` changes; see "Changing the email domain" in the deployment guide).
- Investigate why `drizzle-orm`'s release candidate costs about 200 MB of memory to load (upgrade when a fixed release ships).
- Put Cloudflare (WAF/Turnstile) in front, against botnet-scale credential stuffing; it would also cut response times for distant visitors [P09].
- Automated database backups stored off the server.
- Return 400, not 500, for malformed JSON bodies.
- Possibly let a password reset also mark the email as verified.

## Future scope
Larger directions beyond Next up, roughly in order of value. Each one says what in the current code it builds on or changes.

**Accounts and sessions**
- **Many sessions per user.** `users.refresh_token` holds a single session, so signing in on a second device ends the first. A `sessions` table (the `microservice-architecture` branch already has one) would add a device list, "sign out this device" and "sign out everywhere else".
- **Revoking access tokens at once.** Closes a known gap: today a signed-out access token keeps working until it expires (up to 15 minutes). A per-user session version checked by `authenticateToken` would end it immediately.
- **Change email.** Verify the new address before switching, and tell the old one. Today the email is fixed once the account exists.
- **Edit profile, delete account, export data.** Today the name only changes at sign-up and the avatar only through upload. Deletion and a JSON export cover the basics of GDPR, the EU's data-protection law (deletion must remove the ImageKit avatar too).
- **Security emails.** "New sign-in from …", "Your password was changed", "Your email was verified": sent in the background, like the existing emails.

**Stronger sign-in**
- **Two-factor authentication.** Six-digit codes from an authenticator app (TOTP), with hashed recovery codes; a second step after the password, with its own rate limit.
- **Passkeys (WebAuthn).** Sign in with the device's fingerprint, face or PIN, with no password; the strongest protection against phishing.
- **Breached-password check.** Reject passwords that appear in Have I Been Pwned's leak database at sign-up, reset and change. Its range API only receives the first five characters of the password's hash, never the password.
- **Google and GitHub sign-in.** Link to an existing account by email only when the provider says the email is verified, and never to an unverified local account (LEARNINGS, "Pre-account takeover").
- **Magic-link sign-in.** Sign in from an emailed link, reusing the existing single-use, hashed, 15-minute token pattern.

**Authorization**
- **Roles and permissions.** The landing page promises "decide what gets through": add roles (user, admin), a `requireRole()` middleware that runs after `authenticateToken`, and permission checks per route.
- **Admin dashboard.** Search users, see sessions and rate-limit hits, resend verification emails, lock or unlock an account.
- **Activity log.** Sign-ins, password changes and failed attempts, shown to the user on their dashboard.

**CKAuth as a product for other apps**
- **Hosted sign-in for other apps.** Register an app, get keys, send users to CKAuth's sign-in page and back. Built on OpenID Connect (the standard behind "Sign in with Google", using the authorization-code flow with PKCE), so any standard client library works.
- **SDKs.** `@ckauth/react` (a provider, `useAuth` and protected routes; mostly `frontend/src/lib/auth.tsx` and `api.ts` today) and an Express middleware package.
- **Webhooks.** Notify other apps of `user.created`, `user.verified` and `session.revoked`, signed with HMAC so they can prove the message came from CKAuth.
- **CORS per registered app,** needed as soon as a frontend on another origin uses the API (see Known gaps in CLAUDE.md).
- **Self-host kit.** The compose stack, edge proxy and setup script, packaged as a documented template for running your own copy.

**Quality and operations**
- **Automated tests.** There is no test suite yet. Start with integration tests of every flow against a real Postgres and Redis in CI, including the race-condition and account-enumeration rules in CLAUDE.md.
- **OpenAPI from the Zod models.** Generate a machine-readable API description from `models.ts`, so `docs/API.md` and a typed client can't drift from the code.
- **Observability: activity logs, alerts and a stats dashboard.** Today Caddy writes an access log, the API has only scattered `console.log`/`console.error` calls, and neither compose file sets a size limit on container logs, so Docker keeps every line until the disk fills. The plan is layered, cheapest first:
  - **Foundation (needed by every option).** Docker log rotation (`logging: max-size/max-file`) in both compose files; structured JSON logs with pino, with `redact` stripping `password`/`token` fields so the "never log secrets" rule can't be broken by accident; request IDs; and an `audit_events` table (sign-up, sign-in success/failure, verify, reset, session ended, avatar change, rate-limit hit), written in the *same* transaction as the action, so an action can never happen without its record. This also feeds the user-facing **Activity log** above.
  - **Dashboard and alerts (recommended): Grafana Cloud's free tier.** An agent on the VPS sends logs and metrics; alerts go to email/Telegram. Uses almost no VPS memory and still alerts when the VPS itself is down. Trade-offs: 14–30 day retention, and users' emails/IPs go to a third party (mention it in a privacy policy).
  - **Security: CrowdSec** (~100 MB) reads Caddy and SSH logs, spots brute force and scans, and blocks attacking IPs for every site on the VPS.
  - **Alternatives considered:** (1) *built into CKAuth*: an admin page charting `audit_events`, Uptime Kuma for uptime alerts and a scheduled query for "too many failed sign-ins"; the lightest and most private option, but basic charts, and it can't see server-level events. (2) *Self-hosted Grafana + Loki + Prometheus + Alloy*: the industry standard and private, but ~1–1.5 GB RAM on a VPS shared with other sites, four more services to maintain, and Grafana must be locked down. Move here later if the VPS is upgraded; the app side doesn't change. (3) *Wazuh* for file integrity monitoring: needs 4–8 GB RAM, too heavy for this VPS.
  - Keep at least one check (uptime or alerting) *outside* the VPS: a monitor on the server it watches can't report that server's death.
- **Email templates and languages.** Branded, tested email templates, and translations for emails and the web app.
- **Accessibility pass.** A full WCAG 2.2 AA review of the forms and dashboard, beyond the landing page covered in `docs/SEO-AUDIT.md`.
