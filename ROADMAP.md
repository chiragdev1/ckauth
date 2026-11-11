# Roadmap: CKAuth

What's planned, nearest first. Finished work moves to [DEVLOG.md](DEVLOG.md) as a dated entry, and its item here is struck (`~~…~~: done <date>`) in the same change. Design detail for Sign in with CKAuth is in [docs/OIDC.md](docs/OIDC.md); known gaps are listed once, in [README.md](README.md#known-limitations).

Moved out of DEVLOG.md on 11 Nov 2026, so the dev log holds only history.

## Next up
Short-term work, roughly in order. Bracketed IDs such as [B01] point to tests in [docs/SEO-AUDIT.md](docs/SEO-AUDIT.md).

- **Observability, next layer:** ship the logs off the VPS (Grafana Alloy → Grafana Cloud) with alerts on error rate and sign-in failures, plus an external uptime check, so a dead VPS still raises an alarm. See Future scope, "Observability".
- **Activity log, the rest of the 7 Nov review:** (1) alerts on bursts of `sign_in_failed` and `admin_reauth_failed`, and on a new device followed by an email or password change, best done with the log shipping above; (2) record sign-in attempts for unknown emails, unverified sign-ins and non-admins calling `/admin/*`; (3) say which device `sessions_revoked` signed out, and keep the user agent on events; (4) show account owners their own activity on the dashboard; (5) decide whether logout and the 11th-device eviction count as events.
- Watch the first CI run with the Postgres service. (~~Delete the old `tests` branch and the 23 Oct stash~~: both gone.)
- **SEO phase 1:**
  - Deploy the general landing page and its search copy (27 Oct) [O01, O02]. Re-run the SEO audit against it: the page now targets "secure sign-in and user accounts for your website" [O03].
  - Have a lawyer review the Privacy Policy and Terms, and confirm the operator and Grievance Officer name, the ₹1,000 liability cap, and a city for "Governing law" (it says only "the courts of India").
  - Make the last open retention promise concrete: delete unconfirmed sign-ups after a fixed period (e.g. 30 days). Logs and the activity log now have stated periods.
  - Check that open and click tracking is off for the sending domain in Resend; then the policy can say emails aren't tracked.
  - Decide whether the device list should show an approximate location (an offline GeoLite2 lookup at display time, nothing stored), and whether sessions should keep a sign-in history; either needs the Privacy Policy.
  - Drop the unused `users.refresh_token` and `users.reauthenticated_at` columns, one release after the sessions deploy.
  - Check the new header at 320, 360 and 390 px in a real phone or DevTools, and the skip link, focus moves and ticker pause with a screen reader (VoiceOver or NVDA); the review fixes were built and prerendered but not yet tried in a browser.
  - Build the "Connect your website" flow the dashboard now announces: that's Sign in with CKAuth ([docs/OIDC.md](docs/OIDC.md)); until it ships, keep the FAQ saying a developer sets CKAuth up.
  - ~~Split the inlined CSS so the home page carries only its own classes~~: critical CSS since 7 Nov 2026; `homeHtml` is now 18.75 KiB.
  - Count the whole sign-up funnel (visit → sign-up → verified) once analytics exist; tagged links (`?ref=`) are counted since 6 Nov. If analytics are added, update the Privacy Policy, which now describes only the link counters.
  - Replace the placeholder pricing with real plans before taking payments, and build or drop the paid-plan features it lists (priority email help, the shop's name on login emails, early access).
  - ~~Pick the email theme~~: Midnight, 6 Nov 2026. Still to do: send a real email to a Gmail inbox on a phone in dark mode to check it.
  - ~~Translate the app into Hindi~~: Hindi was removed on 7 Nov 2026. Any future translation loads on demand, not in the home page's first-load bundle (LEARNINGS, Languages).
  - Verify `chiragdev.com` in Google Search Console and Bing Webmaster Tools (DNS TXT records cover every subdomain), submit `sitemap.xml`, request indexing, and check with Google's Rich Results Test [C10, C11]. Add an IndexNow ping to `deploy.sh` [C12].
  - Replace the Hostinger parked page on `chiragdev.com` with a portfolio that links to CKAuth [D02].
  - LCP is still ~2.2 s in the mobile lab [P02]: next steps are a smaller first-screen font load and a CDN [P09].
  - Stop the `/auth/me` + `/auth/refresh` 401 errors on every visit by a signed-out user [B01].
  - Add a CAA record, an AAAA (IPv6) record, COOP/CORP headers and a `/index.html` → `/` redirect [B06, P12, B07, C07].
  - Set the GitHub repo's homepage, description and topics; link the repo and API docs from the footer; add Person JSON-LD with `sameAs`; ~~add PNG icons and a web manifest~~ (done: `public/manifest.json`, `icon-192/512.png`) [D05, O11, O08, O09].
  - Self-host Umami analytics, add an external uptime check, count the sign-up funnel, and extend the domain registration to 2+ years with auto-renew [M01–M03, D08].
  - Add a DMARC report address (`rua`) now and move to `p=quarantine` after 2–4 clean weeks; register `mail.chiragdev.com` in Google Postmaster Tools [D07].
  - Launch posts: Show HN, r/node, r/webdev, dev.to, LinkedIn [M05].
- **SEO phase 2 (months 1–3):** two articles a month on `chiragdev.com/blog` based on LEARNINGS, cross-posted with canonical links, to earn the first links from other sites [O06, D03].
- **SEO phase 3 (months 3–12):** API docs as site pages [O06]; landing-page JavaScript under 100 kB gzipped (critical CSS is inlined since 7 Nov 2026) [P03, P06–P08]; listings on curated "awesome" lists; a monthly Search Console review [M04]; HSTS `includeSubDomains` + preload once every subdomain is HTTPS-only [B03].
- Move the sender to a CKAuth-branded domain (only `EMAIL_FROM` changes; see "Changing the email domain" in the deployment guide).
- Investigate why `drizzle-orm`'s release candidate costs about 200 MB of memory to load (upgrade when a fixed release ships).
- Put Cloudflare (WAF/Turnstile) in front, against botnet-scale credential stuffing; it would also cut response times for distant visitors [P09].
- Automated database backups stored off the server.
- Fix the known limitations listed in [README.md](README.md#known-limitations) (the one list of them), starting with malformed JSON returning 500.

## Future scope
Larger directions beyond Next up, roughly in order of value. Each one says what in the current code it builds on or changes.

**Accounts and sessions**
- **Export data.** Editing the profile and deleting the account are done (2 Nov); a JSON export of everything stored would complete the basics of GDPR, the EU's data-protection law.
- **Admin tools.** Filters on `/admin`, editing a user, resending an invite, and MFA for admins. A role rank (`user` < `admin` < `owner`) once more than one person administers CKAuth. Browser end-to-end tests (Playwright) of sign-up → verify → dashboard.
- ~~**Security emails.**~~ Done: "New sign-in" (2 Nov), "Your password was changed" and the welcome email on verifying.

**Stronger sign-in**
- **Two-factor authentication.** Six-digit codes from an authenticator app (TOTP), with hashed recovery codes; a second step after the password, with its own rate limit.
- **Passkeys (WebAuthn).** Sign in with the device's fingerprint, face or PIN, with no password; the strongest protection against phishing.
- **Breached-password check.** Reject passwords that appear in Have I Been Pwned's leak database at sign-up, reset and change. Its range API only receives the first five characters of the password's hash, never the password.
- **Google and GitHub sign-in.** Link to an existing account by email only when the provider says the email is verified, and never to an unverified local account (LEARNINGS, "Pre-account takeover").
- **Magic-link sign-in.** Sign in from an emailed link, reusing the existing single-use, hashed, 15-minute token pattern.

**Authorization**
- ~~**Roles and permissions.**~~ Roles (`user`, `admin`) and `authorizeRoles()` shipped 2 Nov 2026. Still open: finer permissions per route.
- **Admin dashboard, the rest.** `/admin` (stats, search, invite, delete, activity) shipped 2 Nov 2026. Still open: see sessions and rate-limit hits, resend verification emails, lock or unlock an account.
- **Activity log for users.** Their own sign-ins, password changes and failed attempts on the dashboard. The `audit_events` table already holds them: it's `GET /admin/activity` filtered to the signed-in user.

**CKAuth as a product for other apps**
- **Hosted sign-in for other apps** (Sign in with CKAuth): designed, being built. The design, the 33 security rules and what's later are in [docs/OIDC.md](docs/OIDC.md).
- **SDKs.** `@ckauth/react` (a provider, `useAuth` and protected routes; mostly `frontend/src/lib/auth.tsx` and `api.ts` today) and an Express middleware package.
- **Webhooks.** Notify other apps of `user.created`, `user.verified` and `session.revoked`, signed with HMAC so they can prove the message came from CKAuth.
- **CORS per registered app:** part of Sign in with CKAuth ([docs/OIDC.md](docs/OIDC.md), rule 25).
- **Self-host kit.** The compose stack, edge proxy and setup script, packaged as a documented template for running your own copy.
- **Import an existing user database.** Let a site that already has users move them to CKAuth without everyone signing up again. A `pnpm admin import <file>` command in `manage-users.ts` (the server-only CLI) reads a CSV or JSON export, with `--dry-run` printing what would happen first.
  - **Passwords.** Existing bcrypt hashes (`$2a$`/`$2b$`, any cost) are copied as they are: `bcrypt.compare` already reads them, so those users sign in on day one. Other formats (Argon2, scrypt, PBKDF2, salted SHA) are stored in new `legacy_password_hash` and `legacy_password_algo` columns and checked by **lazy rehashing**: on the first successful sign-in, CKAuth verifies with the old algorithm, saves a bcrypt hash at `PASSWORD_HASH_ROUNDS` and clears the legacy columns in the same transaction. Unsalted MD5/SHA-1 hashes, or no hash at all, aren't trusted: those accounts get a "set your password" email through the existing reset flow, like admin invites.
  - **Accounts.** Emails go through `emailModel` (trimmed, lowercased) and insert with `onConflictDoNothing`, so a duplicate or an existing CKAuth account is skipped and reported, never overwritten. Every import is `role: 'user'`, whatever the source says: admins stay made only out-of-band. The source's "verified" flag is kept only with `--trust-verified`; otherwise the first sign-in or reset verifies the inbox. Sessions aren't moved (everyone signs in once), and avatars are re-uploaded to ImageKit under random names rather than linked to the old host.
  - **Records and privacy.** One `user_imported` audit event per account, in the insert's transaction, with the source name in `details`; the Privacy Policy gains a line on imported data. Batched inserts (about 1,000 rows each) keep a large import from holding one long transaction.
  - **Later: trickle migration** for sites that can't export hashes: when an unknown email signs in, CKAuth checks the password against the old system's API once, creates the account on success, and the old system is switched off when the sign-ins stop.

**Quality and operations**
- **Automated tests.**
  - ✅ **API and frontend unit tests, done 2 Nov 2026.** Integration tests of every flow against a real Postgres, run in CI with a coverage minimum (see "A test suite, and the pre-PR checks back").
  - ✅ **Browser end-to-end tests, first part done 6 Nov 2026** (sign-up and sign-in in Chromium, Firefox and a phone profile). Still to do: password reset, the dashboard, sessions, admin, and running them in CI.
- **OpenAPI from the Zod models.** Generate a machine-readable API description from `models.ts`, so `docs/API.md` and a typed client can't drift from the code.
- **Observability: activity logs, alerts and a stats dashboard.** The foundation landed on 2 Nov 2026: structured logs with request IDs and the `audit_events` table. (Container logs were already capped by `setup-vps.sh`'s `daemon.json`, 3 × 10 MB, since 21 Oct.) The plan was layered, cheapest first:
  - ✅ **Foundation (needed by every option), done 2 Nov 2026.** Docker log rotation (`logging: max-size/max-file`) in both compose files; structured JSON logs with pino, with `redact` stripping `password`/`token` fields so the "never log secrets" rule can't be broken by accident; request IDs; and an `audit_events` table (sign-in success/failure, verify, reset, session ended, avatar change; sign-up events were dropped on 6 Nov 2026), written in the *same* transaction as the action, so an action can never happen without its record. This also feeds the user-facing **Activity log** above.
  - **Dashboard and alerts (recommended): Grafana Cloud's free tier.** An agent on the VPS sends logs and metrics; alerts go to email/Telegram. Uses almost no VPS memory and still alerts when the VPS itself is down. Trade-offs: 14–30 day retention, and users' emails/IPs go to a third party (mention it in a privacy policy).
  - **Security: CrowdSec** (~100 MB) reads Caddy and SSH logs, spots brute force and scans, and blocks attacking IPs for every site on the VPS.
  - **Alternatives considered:** (1) *built into CKAuth*: an admin page charting `audit_events`, Uptime Kuma for uptime alerts and a scheduled query for "too many failed sign-ins"; the lightest and most private option, but basic charts, and it can't see server-level events. (2) *Self-hosted Grafana + Loki + Prometheus + Alloy*: the industry standard and private, but ~1–1.5 GB RAM on a VPS shared with other sites, four more services to maintain, and Grafana must be locked down. Move here later if the VPS is upgraded; the app side doesn't change. (3) *Wazuh* for file integrity monitoring: needs 4–8 GB RAM, too heavy for this VPS.
  - Keep at least one check (uptime or alerting) *outside* the VPS: a monitor on the server it watches can't report that server's death.
- **Email templates and languages.** Branded, tested email templates, and translations for emails and the web app.
- **Accessibility pass.** A full WCAG 2.2 AA review of the forms and dashboard, beyond the landing page covered in `docs/SEO-AUDIT.md`.
