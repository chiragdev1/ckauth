# Glossary

Plain definitions of the terms used across CKAuth's docs ([README](../README.md), [API](API.md), [Deployment](DEPLOYMENT.md), [DEVLOG](../DEVLOG.md), [LEARNINGS](../LEARNINGS.md), [SEO audit](SEO-AUDIT.md)). Where it helps, each entry says how CKAuth uses the idea.

## Contents

- [Web basics](#web-basics)
- [Sign-in and security](#sign-in-and-security)
- [Sign in with CKAuth (OpenID Connect)](#sign-in-with-ckauth-openid-connect)
- [Database](#database)
- [Server and performance](#server-and-performance)
- [Frontend](#frontend)
- [Hosting and deployment](#hosting-and-deployment)
- [Logs and monitoring](#logs-and-monitoring)
- [Email delivery](#email-delivery)
- [Search, speed and accessibility](#search-speed-and-accessibility)
- [Growth and legal](#growth-and-legal)

---

## Web basics

**API (Application Programming Interface).** A set of addresses a program can call to ask a server to do something. CKAuth's API lives under `/auth`, for example `POST /auth/sign-in`.

**Endpoint.** One address in an API, together with its HTTP method: `GET /auth/me` and `POST /auth/logout` are two endpoints.

**HTTP method.** The verb of a request. `GET` reads something; `POST` creates something or performs an action.

**Status code.** The three-digit number a server returns with every response:

| Code | Meaning | Example in CKAuth |
|---|---|---|
| 200 | OK | Signed in |
| 201 | Created | Sign-up accepted |
| 308 | Permanent redirect | `http://` sent to `https://` |
| 400 | Bad request (invalid input) | A malformed email address |
| 401 | Unauthorized: we don't know who you are | Missing or expired session |
| 403 | Forbidden: we know who you are, but you may not do this | Email not verified yet |
| 404 | Not found | A page that doesn't exist |
| 409 | Conflict | Not used: sign-up never reveals an existing account |
| 413 | Payload too large | An avatar over 2 MB |
| 429 | Too many requests | Rate limit reached |
| 500 | Server error | A bug |
| 502 | Bad gateway: the proxy couldn't reach the app | The API container is down |

**Header.** Extra information sent with a request or response, as `Name: value` lines. Security settings such as CSP are headers.

**JSON.** A text format for data, such as `{"email": "ada@example.com"}`. CKAuth's requests and responses are JSON.

**Cookie.** A small piece of data the server asks the browser to store and send back with later requests. CKAuth keeps its session tokens in cookies.

**httpOnly cookie.** A cookie that JavaScript on the page cannot read. If an attacker manages to run a script on the page, they still can't steal the session.

**SameSite.** A cookie setting that controls whether the browser sends the cookie when another site makes the request. `Lax` (CKAuth's setting) blocks most cross-site uses, which protects against CSRF.

**Origin.** The scheme, domain and port of a URL, such as `https://ckauth.chiragdev.com`. Two URLs with the same origin are "same-origin".

**CORS (Cross-Origin Resource Sharing).** Rules that let a page on one origin call an API on another. CKAuth doesn't need CORS, because the web app and the API share one origin.

**HTTPS / TLS.** Encrypted HTTP. TLS is the encryption protocol, and a certificate proves the server owns its domain.

**Proxy / reverse proxy.** A server that sits in front of other servers and forwards requests to them. CKAuth uses Caddy as its reverse proxy.

**Upstream.** From a proxy's point of view, the app it forwards requests to. Caddy's *upstream sockets* are its connections to the API.

**`X-Forwarded-For`.** A header a proxy adds to say which IP the request originally came from. Express reads it when `trust proxy` is on.

---

## Sign-in and security

**Authentication.** Proving *who* someone is, for example with an email and password. Failure is a `401`.

**Authorization.** Deciding *what* that person may do. Failure is a `403`.

**Role.** A label on an account that decides what it may do. CKAuth has two: `user` (everyone) and `admin` (can see, add and delete users).

**RBAC (role-based access control).** Granting permissions to roles rather than to individual people, then checking the role on each request. CKAuth's `authorizeRoles('admin')` middleware is a small example.

**Re-authentication / sudo mode.** Asking for the password again before a dangerous action, even in a valid session, and trusting it for a short while afterwards. CKAuth's admins confirm their password before inviting or deleting users, and it stays confirmed for 15 minutes. GitHub uses the same pattern.

**Invite.** Creating an account for someone else without choosing their password: they get a link to set it themselves, so only they ever know it.

**Out-of-band.** Done through a separate channel from the normal one. CKAuth makes and removes admins with a script on the server, out-of-band from the website, so a stolen session can't do it.

**Session.** The period during which a user stays signed in without re-entering their password. CKAuth keeps one row per signed-in device in its `sessions` table, so each device can be signed out on its own, and up to 10 at a time per user.

**JWT (JSON Web Token).** A signed token that carries facts such as a user ID. The server can check the signature, so it can tell if anyone changed the token.

**Claim.** One fact stored inside a JWT, such as the user ID (`sub`), the expiry time (`exp`) or a unique token ID (`jti`).

**Access token.** A short-lived JWT (about 15 minutes) sent with each request to prove who the user is.

**User agent.** A header the browser sends with every request describing itself, such as `Mozilla/5.0 (Windows NT 10.0; …) Chrome/130…`. CKAuth stores it per session so the device list can say "Chrome on Windows". The browser can send anything here, so it's a hint, not proof.

**Lightbox.** A view that opens an image full size over the page, dimming what's behind it, and closes with Escape or a click. CKAuth's avatars open in one.

**Refresh token.** A longer-lived token whose only job is to get a new access token when the old one expires.

**Token rotation.** Replacing the refresh token every time it's used. A stolen token stops working after one use.

**Hash.** A one-way scramble of data: you can check a value against its hash, but you can't recover the value from it. CKAuth stores only hashes of passwords and tokens.

**bcrypt.** A password-hashing function that is deliberately slow, so an attacker with a leaked hash can try far fewer guesses per second. `bcrypt` is the fast native version; `bcryptjs` is pure JavaScript and blocks the server while it runs.

**Lazy rehashing.** Upgrading a password hash at the moment the user next signs in, because that's the only time the server sees the plain password. Planned for importing users whose old system used a different hash function: check the old hash once, then store a bcrypt one.

**Trickle migration.** Moving users from an old system one at a time, as each signs in, instead of all at once: the new system asks the old one to check the password, then creates the account. Used when the old hashes can't be exported.

**SHA-256.** A fast hash function. It's fine for long random tokens, but unsafe for passwords, because people choose guessable passwords.

**HMAC.** A hash mixed with a secret key, used to prove a message wasn't changed. It's too fast to be safe for passwords.

**Salt.** Random data added to a password before hashing, so that two equal passwords get different hashes. bcrypt adds its own salt.

**Account enumeration.** Finding out which emails have accounts by watching how the app responds. CKAuth gives the same answer whether or not an account exists.

**Timing attack / timing leak.** Learning a secret from how *long* a response takes. CKAuth's sign-in once answered faster for unknown emails, which gave away who was registered.

**Pre-account takeover.** An attacker signs up with someone else's email before the real owner does, and keeps access afterwards. CKAuth blocks it by asking for the sign-up password when the email is verified.

**Rate limiting.** Capping how many requests one IP address, email or user can make in a time window. Over the limit, the answer is `429`.

**Credential stuffing.** An attack that tries email/password pairs leaked from *other* sites.

**Fail open / fail closed.** What a safety check does when it breaks: *fail open* lets requests through, *fail closed* blocks them. CKAuth's rate limits fail open, so a Redis outage doesn't lock everyone out.

**Botnet.** Many hijacked computers that attack together, from many IP addresses.

**CSRF (Cross-Site Request Forgery).** A malicious site making your browser send requests to another site where you're signed in. `SameSite` cookies prevent most of it.

**CSP (Content Security Policy).** A header that tells the browser which scripts, styles and images it may load. CKAuth's CSP blocks inline scripts, except the one theme script it names by **hash**: a fingerprint of the script's exact text (`'sha256-…'`), so changing even one character blocks it until the hash is updated.

**HSTS (HTTP Strict Transport Security).** A header that tells the browser to always use HTTPS for the site.

**Magic bytes.** The first bytes of a file, which reveal its real type (a PNG always starts with the same bytes). CKAuth trusts these, not the file name or the type the browser claims.

**TOTP.** The six-digit codes from an authenticator app, used for two-factor sign-in.

**MFA (multi-factor authentication).** Proving who you are with two different things, such as a password plus a code from an app on your phone, so a stolen password alone isn't enough. CKAuth doesn't have it yet; sudo mode is the interim protection for admin actions.

**Passkey (WebAuthn).** Signing in with the device's fingerprint, face or PIN instead of a password. Passkeys resist phishing.

**OpenID Connect (OIDC) / PKCE.** The standard protocol behind "Sign in with Google". PKCE is the part that protects the exchange in browser and mobile apps. CKAuth's planned use of it, and every term that comes with it, are in [Sign in with CKAuth](#sign-in-with-ckauth-openid-connect) below.

---

## Sign in with CKAuth (OpenID Connect)

Terms from the [OIDC design](OIDC.md), the planned feature that lets other apps sign their users in through CKAuth. The design explains the whole flow with an analogy first.

**OAuth 2.0.** The standard for letting an app act on a user's behalf with a limited permission (a token) instead of their password. On its own it says nothing about *who* the user is.

**OpenID Provider (OP) / authorization server.** The service that signs users in and issues tokens. With this feature, CKAuth.

**Client / relying party (RP).** An app that sends its users to the provider to sign in and relies on the answer, for example a shop's website.

**Confidential client / public client.** A confidential client has a server that can keep a secret. A public client (a single-page app or mobile app) runs on the user's device, so anything in it can be read; it relies on PKCE instead of a secret.

**Client registration.** Telling the provider about an app: its name, redirect URIs and allowed scopes. It returns a `client_id` and, for confidential clients, a `client_secret`. In CKAuth, only admins can do it.

**`client_id` / `client_secret`.** The app's public identifier and its password. The secret is shown once and stored only as a hash.

**Redirect URI.** The exact address the provider sends the user back to after sign-in. Compared character for character, because a loose match lets an attacker receive the user's code.

**Open redirect.** A site that will send visitors to any address named in a link. Attackers use one to make a phishing link look like it belongs to a trusted site.

**Scope.** A named permission the app asks for, such as `email` or `profile`. `openid` is the scope that makes a request OIDC; `offline_access` asks for a refresh token.

**Consent.** The screen where the user approves what an app asked for. CKAuth remembers the answer per app.

**Authorization code.** A one-time, 60-second value the provider gives the browser after sign-in. It's useless alone: the app's server swaps it, with proof, for tokens.

**Front channel / back channel.** The front channel is the browser travelling between sites (redirects), which anything on the device can see. The back channel is a direct server-to-server request, which the browser never sees. Tokens only travel on the back channel.

**`state`.** A random value the app sends with the request and checks when the user comes back, so an attacker can't make the user's browser finish a sign-in the attacker started (a form of CSRF).

**`nonce`.** A random "number used once" that the app sends and the provider copies into the ID token, so an old token can't be replayed.

**Replay attack.** Capturing something valid, such as a token, and sending it again later to be accepted a second time.

**`code_verifier` / `code_challenge`.** The two halves of PKCE. The verifier is a random secret the app keeps; the challenge is its SHA-256 hash, sent at the start. To redeem the code, the app must show the verifier, which an attacker who stole the code doesn't have. `S256` names the hash method.

**ID token.** A signed JWT from the provider that says who the user is. Meant for the app to read once, at sign-in.

**Bearer token.** A token that works for whoever holds it, like cash. OIDC access tokens are bearer tokens, so they're short-lived.

**`iss`, `sub`, `aud`, `exp`, `iat`, `auth_time`.** The standard claims in an ID token. `iss` (issuer) is who made it; `sub` (subject) is which user; `aud` (audience) is which app it's for; `exp` is when it expires; `iat` is when it was issued; `auth_time` is when the user last typed their password. An app must check `iss`, `aud`, `exp` and `nonce`, plus the signature, before trusting a token.

**`typ`.** A JWT header field naming the kind of token: `JWT` for ID tokens, `at+jwt` for access tokens. Different values stop one kind being accepted as the other.

**Pairwise subject identifier.** A user ID that's different for each app (each *sector*: the host name of an app's redirect URIs), so two apps can't compare user lists to find people they share.

**Single sign-on (SSO).** Signing in once and being signed in to many apps. With OIDC, it works because the provider remembers your session.

**Asymmetric signing (ES256 / RS256).** Signing with a private key that only the provider has, and checking with a public key anyone can have. ES256 uses elliptic curves, RS256 uses RSA. CKAuth's own session tokens use **HS256**, a single shared secret that both signs and checks; that's fine inside one server but can't be handed to other apps.

**Algorithm confusion.** An attack on verifiers that let the token choose its own algorithm: the attacker signs an HS256 token using the public key as if it were the shared secret. Prevented by always naming the accepted algorithm.

**JWKS (JSON Web Key Set).** The provider's public keys, published at `/.well-known/jwks.json`. Each key has a **`kid`** (key ID), so keys can be replaced without breaking tokens that are still valid.

**Discovery document.** A JSON file at `/.well-known/openid-configuration` listing a provider's endpoints and options, so a client library can set itself up from the issuer's address alone.

**Userinfo endpoint.** An endpoint that returns the user's profile when called with an access token.

**Mix-up attack.** An attack on apps that use several providers: a malicious provider tricks the app into sending it a code issued by another provider. Prevented by the provider adding `iss` to its redirect back to the app.

**Clickjacking.** Hiding a real button (such as "Allow") under a fake page inside an invisible frame, so the user clicks it without knowing. Prevented by never allowing the page in a frame.

**Revocation.** Cancelling a token before it expires.

**OpenID conformance suite.** The OpenID Foundation's free test tool that checks a provider against the standard. Passing it is how providers show they're compliant (and is required for OpenID certification).

**PAR, DPoP.** Optional extras for higher security. PAR (Pushed Authorization Requests) sends the sign-in request over the back channel first, so the browser can't tamper with it. DPoP ties a token to a key the app holds, so a stolen token is useless on its own.

---

## Database

**PostgreSQL (Postgres).** The database CKAuth stores its users in.

**ORM.** A library that lets code work with database tables as objects. CKAuth uses **Drizzle**.

**Schema.** The definition of the tables and columns (`src/db/schema.ts`).

**Migration.** A file of SQL that changes the schema from one version to the next. Migrations are applied in order and never edited after release.

**Transaction.** A group of database changes that succeed or fail together.

**Role.** A database account. Each role has its own password and its own rights on each table. CKAuth uses two: `ckauth` owns the database (migrations, backups), and `ckauth_api` is what the API connects as, with only the rights it needs. Giving each part only the rights it needs is called **least privilege**.

**Trigger.** A function the database runs by itself before or after a change to a table. CKAuth uses triggers to make the activity log **append-only**: new events can be added, but existing ones can't be edited, and can be deleted only by the scheduled pruning.

**Seed data.** Made-up records loaded into a development database so a page can be judged with realistic content. `pnpm seed:activity` adds six fake users and a month of activity events, and refuses to run in production.

**Unique constraint.** A database rule that a column can't hold the same value twice, such as two accounts with one email.

**Race condition.** A bug that appears only when two requests arrive at almost the same moment and interfere with each other.

**Check-then-act.** Reading a value, then deciding what to write based on it. Between the read and the write, another request can change the value, so this pattern causes race conditions.

**Conditional UPDATE.** An `UPDATE … WHERE …` that changes a row only if a condition still holds, and reports whether it did. The database itself decides which request wins.

**Row lock (`SELECT … FOR UPDATE`).** Locking a row inside a transaction, so other requests wait until you're done with it.

**Enum (enumerated type).** A type that allows only a fixed list of values. The `role` column is a Postgres enum (`user_role`), so the database itself rejects any other role.

**Pagination.** Returning a long list one page at a time (`?page=2&limit=20`), so a single request never has to load every row.

**`onConflictDoNothing`.** Drizzle's way of saying "insert this row, but if it breaks a unique constraint, skip it quietly".

**Index (database).** A sorted lookup structure kept beside a table, like a book's index, so the database can find matching rows without reading every one. Every column a request filters on should have one: `email`, each session's refresh-token hash, and the email-link token columns.

**Full table scan (sequential scan).** Reading every row of a table to find the matches. Instant on a small table, but it slows down with every row added; an index avoids it.

**Partial index.** An index on only the rows that match a condition. CKAuth's token indexes cover only rows `WHERE … IS NOT NULL`, the users with a link waiting in their inbox, so they stay small however many accounts there are.

**Explain plan (`EXPLAIN`).** Postgres's description of how it would run a query: by scanning the whole table or by using an index. On a nearly empty table it often picks a scan anyway, because that's cheapest there.

**Trigram index (`pg_trgm`).** A Postgres index that splits text into three-letter pieces, so "contains this text" searches (`ilike '%ada%'`) can use an index. Admin search may need one once there are many users.

---

## Server and performance

**Node.js.** The JavaScript runtime the API runs on.

**Unit test.** A test of one function on its own, with no server or database, such as "the email is lower-cased".

**Integration test.** A test that runs several parts together: CKAuth's send real HTTP requests to the app, which talks to a real (test) database.

**End-to-end (E2E) test.** A test that drives a real browser through the real site, clicking and typing as a user would, against a running API and database. It catches what API tests can't (a broken button, a form that never reaches the server). Slower than other tests, so CKAuth keeps them to the main journeys.

**Playwright.** The tool CKAuth's E2E tests use to control Chromium, Firefox and WebKit (Safari's engine), including a phone-sized screen.

**Test runner.** The program that finds the tests, runs them and reports what failed. CKAuth uses the one built into Node (`node:test`).

**Code coverage.** How much of the code the tests actually run, as a percentage of lines, branches (each side of an `if`) and functions. CKAuth's checks fail if it drops below a set minimum.

**Fail open / fail closed.** What a safety check does when it can't work: let requests through (open) or refuse them (closed). CKAuth's rate limits fail open if Redis is down, so an outage doesn't stop everyone signing in.

**Regression.** Something that used to work and broke after a change. Tests exist mostly to catch these.

**Dead code.** Files, exports or dependencies nothing uses any more. `knip` finds them, and `pnpm check:pr` fails until they're removed.

**Dependency audit.** Checking the libraries a project uses against a list of known security holes (`pnpm audit`), so a vulnerable version gets updated.

**Performance budget.** A size limit, such as "the home page's JavaScript stays under 127 KiB", that fails the checks when a change goes over it, so the site can't get slower unnoticed. CKAuth's checks also warn when a budget is nearly used up, so there's time to plan before a change fails.

**Main thread / event loop.** Node runs your JavaScript on one thread. Anything slow on that thread, like a long calculation, makes every other request wait.

**Thread pool (libuv).** A few background threads Node uses for slow work such as file access, DNS lookups and native bcrypt. Work there doesn't block the main thread.

**Express / middleware.** Express is the web framework. Middleware is a function that runs before a route's handler, for example to check the session (`authenticateToken`) or apply a rate limit.

**Zod.** A library that checks incoming data against a schema and rejects anything that doesn't fit.

**Fire-and-forget.** Starting a task, such as sending an email, without waiting for it to finish. Errors are logged rather than returned to the user.

**Single-flight.** When several callers need the same thing at once, only one request is made and they all share its result. CKAuth's web app refreshes the session this way.

**Stub.** A fake stand-in for a real service in a test, such as an email sender that accepts mail but never sends it.

**Redis.** A fast in-memory data store. CKAuth uses it to count requests for rate limiting.

**Keep-alive.** Reusing one network connection for several requests. Both sides have an idle timeout, and they must agree on it, or one side may send a request on a connection the other has just closed.

**Load test.** Simulating many users at once to find where the system slows down or breaks.

**p50 / p95 / p99.** Percentiles of response time. A p95 of 100 ms means 95% of requests finished within 100 ms. Averages hide slow outliers; percentiles show them.

**Throughput.** Requests handled per second.

**vCPU / core.** A unit of processing power. CKAuth's VPS has two.

---

## Frontend

**React.** The JavaScript library the web app is built with.

**SPA (single-page application).** A site where JavaScript draws every page in the browser instead of loading new HTML from the server.

**Vite.** The tool that runs the frontend in development and builds it for production.

**Tailwind CSS / shadcn/ui / Radix.** Tailwind styles elements with utility classes. shadcn/ui gives ready-made components we copy into the repo, built on Radix's accessible building blocks.

**Bundle.** The JavaScript files the build produces. Smaller bundles load faster.

**Code-splitting / lazy loading.** Splitting the bundle so each page's code downloads only when that page is opened.

**Render-blocking request.** A file (usually CSS or a script in `<head>`) the browser must download before it draws anything. Each one adds a network round trip before the first paint; inlining a small one into the HTML removes it.

**Critical CSS.** Only the styles a page needs for what it shows, inlined into its HTML so it can draw at once; the rest of the stylesheet loads afterwards. CKAuth's home page inlines the rules its own markup and first-load JavaScript use (`frontend/scripts/critical-css.js`), about two thirds of the full sheet, and loads the full sheet at the end of the page for everything else.

**Prerendering.** Turning a page into finished HTML at build time. Visitors and crawlers then get the content without running JavaScript first.

**Hydration.** React taking over prerendered HTML in the browser and making it interactive. The browser's first render must match the HTML exactly, or React reports a *hydration mismatch*.

**Design lab.** CKAuth's development-only switcher for comparing candidate designs on the real pages (`frontend/src/lib/design-lab.tsx`).

**Devanagari.** The script Hindi is written in. Its letters hang from a line along the top (the *shirorekha*) and carry marks above and below, so it needs taller lines than English. The landing page had a Hindi version from 24 Oct to 7 Nov 2026 (see DEVLOG.md).

**`lang` attribute.** Tells the browser (and screen readers) which language a piece of the page is in, e.g. `lang="en"` on CKAuth's pages (`lang="hi"` while the Hindi version existed). CSS can then style that language with `:lang(…)`.

**Error boundary.** A component that catches a crash in the pages below it and shows a friendly screen instead of a blank or raw error page. CKAuth's is `pages/route-error.tsx`, set as the router's `errorElement`.

**Stale chunk.** A lazy-loaded file that no longer exists on the server. Each deploy replaces the hashed files, so a tab opened before it can't load the next page; CKAuth reloads once to fetch the new build (`main.tsx`).

**Scroll restoration.** Starting each new page at the top, and returning to the old position on Back. A full page load does this by itself; an SPA has to do it on purpose (React Router's `<ScrollRestoration />`).

**Focus / focus management.** The focused element is the one that receives the keyboard. When an SPA swaps a page or a view, it must move focus on purpose (CKAuth moves it to `<main>` or the new heading), or keyboard and screen-reader users are left on something that has vanished.

**`unicode-range` / `size-adjust`.** Two `@font-face` settings. `unicode-range` makes the browser download a font only when the page shows characters in that range (CKAuth used it for its Hindi font until Hindi was removed on 7 Nov 2026). `size-adjust` scales one font so it matches the size of the fonts around it.

---

## Hosting and deployment

**VPS (Virtual Private Server).** A rented virtual machine. CKAuth runs on a Hostinger KVM 2 with 2 vCPUs.

**Docker / image / container.** An *image* packages an app with everything it needs to run, and a *container* is a running copy of an image. Docker builds and runs them.

**Docker Compose.** A file (`compose.yml`) that describes several containers and how they connect, so one command starts them all.

**Caddy.** The web server and reverse proxy in front of CKAuth. It gets HTTPS certificates automatically.

**Edge proxy.** The one shared Caddy that receives all traffic on ports 80 and 443 for every site on the VPS, and passes each request to the right project.

**DNS.** The internet's address book, which maps names to IP addresses. Record types used here:

| Record | Holds |
|---|---|
| A / AAAA | The IPv4 / IPv6 address |
| TXT | Free text, used for verification and email rules |
| MX | Where to deliver email |
| CAA | Which certificate authorities may issue certificates for the domain |

**Let's Encrypt / ACME.** A free certificate authority, and the protocol Caddy uses to get certificates from it.

**SSH / SSH key.** SSH gives secure remote access to a server. An SSH key is a key pair: the private half stays on your machine, and the public half goes on the server.

**root / sudo.** `root` is the all-powerful Linux user. `sudo` lets an ordinary user run a single command as root.

**Linux capabilities.** Small pieces of root's power, such as "bind to ports below 1024". CKAuth's containers drop all of them (`cap_drop: ALL`).

**File capability.** A Linux capability attached to a program file, which the program gains when it starts. Containers that drop all capabilities refuse to start such programs, which is why the web image removes Caddy's.

**Network alias.** An extra name a container answers to on a Docker network. CKAuth uses `ckauth-api` and `ckauth-web`, so the shared edge proxy can reach them without clashing with other projects.

**setgid folder.** A folder where new files automatically belong to the folder's group, so several users can share it.

**tmpfs.** A folder that lives only in memory. It's used for scratch files in containers that are otherwise read-only.

**CI/CD.** Continuous integration (automatic checks on every change) and continuous deployment (shipping it automatically). CKAuth uses **GitHub Actions**, and stores images in **GHCR**, GitHub's container registry.

**Commit SHA.** The unique ID of a git commit. Images are tagged with it, so any version can be redeployed.

**Health check.** A regular request that confirms a container is working.

**Smoke test.** A quick check after a deploy that the main pages answer.

**Rollback.** Going back to the previous version after a bad deploy.

**Breaking change.** A change that existing clients must adapt to, or they stop working. In commit messages it's marked with a `BREAKING CHANGE:` footer.

**Environment variable.** A setting passed to the app from outside the code, such as `RESEND_API_KEY`.

---

## Logs and monitoring

**Observability.** Being able to tell what a running system is doing, and why, from what it records: logs, metrics and alerts.

**Structured log.** A log entry written as one JSON object, such as `{"level":"error","msg":"mail failed","mail":"welcome","userId":"7a95…"}`, instead of free text, so tools can filter, count and alert on it. The message stays the same every time (`mail failed`) and the details go in fields, so one search finds every case. **pino** is the fast structured logger CKAuth's API uses (`src/utils/logger.ts`), with **pino-http** writing one line per request.

**Log level.** How serious a log line is: `debug` (developer detail), `info` (normal events), `warn` (unexpected but handled), `error` (something failed and needs fixing), `fatal` (the process can't continue). A server is set to a minimum level and drops everything below it; CKAuth's production runs at `info`, set by `LOG_LEVEL`.

**Redaction.** Removing secrets from a log line before it's written, e.g. replacing a `password` field with `[redacted]`. CKAuth also uses an **allow-list**: the request logger writes only named fields (method, route, status, time taken, IP, user ID), never headers, cookies or the body.

**Audit log.** A record of security-relevant actions, answering "who did what, to whose account, and when?" (sign-ins, wrong passwords, password and email changes, deletions, admin actions). Ordinary logs answer "is the server healthy?" CKAuth's is the `audit_events` table, shown to admins as the **activity log**; each event is written in the same [transaction](#database) as the action it records, so an action can't happen without its record.

**Request ID.** A unique ID given to each request and included in every log line it produces, so all the lines for one request can be found together. CKAuth returns it to the client as the `X-Request-Id` header and stores it on audit events.

**Log rotation.** Capping how large logs grow by starting a new file at a size limit and deleting the oldest. Without it, logs eventually fill the disk. On the VPS, Docker keeps at most three 10 MB files per container.

**Retention.** How long logs or records are kept before being deleted. **Pruning** is the job that deletes them; CKAuth's API prunes audit events daily: sign-ins after 90 days, everything else after a year.

**Rolling window.** A period counted back from now ("the last 7 days") rather than from a calendar boundary ("since Monday"), so a number doesn't drop to zero at the start of each week. The admin stats use rolling windows.

**Metrics.** Numbers measured over time, such as requests per second, error rate or sign-ins per hour. **Prometheus** is the usual tool for storing them.

**Grafana / Loki / Alloy.** Grafana draws dashboards and sends alerts; Loki stores and searches logs; Alloy is the agent that collects logs and metrics and sends them on. **Grafana Cloud** runs all of them as a hosted service.

**Uptime monitor.** A service that requests the site every minute or so and alerts you when it stops answering. **Uptime Kuma** is a self-hosted one.

**Intrusion detection.** Watching logs and system activity for signs of an attack. **CrowdSec** spots attacks such as brute force in logs and blocks the IPs; **Wazuh** also does *file integrity monitoring*, alerting when system files change.

---

## Email delivery

**Resend.** The service CKAuth sends its emails through.

**SPF.** A DNS record listing which servers may send email for a domain.

**DKIM.** A digital signature on each email, which proves the domain sent it and that nobody changed it.

**DMARC.** A DNS policy telling inboxes what to do with mail that fails SPF/DKIM: `none` (only report), `quarantine` (send to spam) or `reject`. `rua` is the address where daily reports go.

**Sender reputation / warming.** How much inbox providers trust a sending domain. New domains start with little trust, and *warming* builds it by sending slowly and cleanly at first.

---

## Search, speed and accessibility

**SEO (Search Engine Optimisation).** Making a site easy for search engines to find, understand and rank.

**Crawler.** A program that fetches pages for a search engine, such as Googlebot or Bingbot.

**Indexing.** A search engine storing a page so it can show it in results.

**robots.txt.** A file at the site's root that tells crawlers which paths not to fetch.

**Sitemap (`sitemap.xml`).** A list of the pages you want indexed.

**noindex / X-Robots-Tag.** An instruction not to show a page in search results. CKAuth sends it as a header on app screens.

**Canonical URL.** The one official address of a page, used when several URLs show the same content.

**Soft 404.** A page that says "not found" but returns status 200. Search engines treat it as low quality.

**Open Graph / Twitter card.** Tags that control the title, text and image shown when someone shares a link.

**OG image (share image).** The picture in a link preview, 1200×630 pixels. CKAuth's is `public/og.png`, rendered from `og-image.svg`. Previews can't follow the reader's light or dark theme, so it is dark only.

**Social preview.** GitHub's version of an OG image: the card shown when the repository is linked. It's uploaded by hand in the repository settings, not read from a file.

**Favicon.** The small icon in a browser tab. CKAuth's is `favicon.svg`, the crest.

**Apple touch icon.** The 180 × 180 PNG an iPhone or iPad uses when someone adds the site to their home screen. Without one, iOS shows a blurry screenshot of the page.

**Web app manifest (`manifest.json`).** A small JSON file that tells Android and Chrome the site's name, colours and home-screen icons.

**Maskable icon / safe zone.** An icon whose background fills the whole square, so the phone can cut it into its own shape (a circle, a rounded square). The important part stays inside the centre 80% circle, the safe zone, which no shape cuts into.

**Wordmark.** A product's name set as a logo. CKAuth's is "CKAuth" in Inter Bold beside the crest.

**Brand guide.** The rules for how a product looks and sounds (name, logo, colours, type, voice), so every page, email and post matches. CKAuth's is `docs/BRAND.md`.

**PNG text chunk (`tEXt`).** A PNG file is a series of chunks; a `tEXt` chunk holds a short label and value that image viewers ignore. CKAuth's brand PNGs store the SHA-256 of their SVG source there, so the build can tell when one is stale.

**`<picture>` element.** HTML that offers several versions of an image and lets the browser pick one, for example by `prefers-color-scheme`. The README uses it to show the light or dark banner.

**Structured data (JSON-LD).** A machine-readable description of the page that search engines read, such as the site's name.

**Lighthouse.** Google's tool that scores a page from 0 to 100 on performance, accessibility, best practices and SEO.

**Core Web Vitals.** Google's measures of loading speed and stability:

| Metric | Measures | CKAuth's strict target |
|---|---|---|
| FCP (First Contentful Paint) | When anything first appears | 1.5 s |
| LCP (Largest Contentful Paint) | When the main content appears | 1.8 s |
| TBT (Total Blocking Time) | How long the page is too busy to respond | 50 ms |
| CLS (Cumulative Layout Shift) | How much the layout jumps around | 0.02 |

**Lab data vs field data (CrUX).** Lab data comes from a test run like Lighthouse. Field data is measured from real Chrome users; Google publishes it as CrUX, but only for sites with enough visitors.

**TTFB (Time To First Byte).** How long the server takes to start answering.

**LCP, CLS.** Spelled out in the Core Web Vitals table above: when the main content appears, and how much the layout jumps. `pnpm perf` records both, with TTFB, every week.

**Orphan branch.** A git branch with no shared history with the others. CKAuth keeps the weekly speed results on one (`perf-data`), so those commits never appear in `main`'s history or trigger a deploy.

**Worktree (git).** A second folder checked out from the same repository on another branch, so a script can write to one branch while the rest of the project stays on another.

**Mermaid.** A text format for charts and diagrams that GitHub draws in Markdown. The performance report uses it for its trend charts.

**CDN (Content Delivery Network).** Servers around the world that keep copies of a site close to its visitors, to cut the time requests travel.

**Backlink / referring domain.** A link to your site from another site. Each distinct linking site is a referring domain. Links are a major signal of trust for search engines.

**Search Console / Bing Webmaster Tools.** Free dashboards from Google and Bing that show how a site appears in search, with tools to submit sitemaps.

**IndexNow.** A protocol for telling Bing and others straight away that a page changed.

**WCAG / contrast ratio.** WCAG is the web accessibility standard. The contrast ratio compares text colour with its background; level AA needs at least 4.5:1 for normal text.

**Screen reader.** Software that reads the page aloud (or to a braille display) for people who can't see it, such as VoiceOver, NVDA and TalkBack.

**Skip link.** A "Skip to content" link that is the first thing the Tab key reaches. It stays hidden until focused and jumps past the header, so keyboard users don't tab through the navigation on every page.

**ARIA attributes.** Extra HTML attributes that tell screen readers what an element is or how it relates to others. CKAuth uses `aria-describedby` (the hint or error that belongs to a field), `aria-live` (a region read out when its text changes, like the password strength word), `aria-pressed` (an on/off button, like the theme and ticker-pause buttons) and `aria-invalid`.

**Reduced motion (`prefers-reduced-motion`).** An operating-system setting for people whom movement on screen makes dizzy or distracts. CKAuth's CSS stops every animation when it's on.

**Touch target.** The area a finger can tap to hit a control. WCAG AA asks for at least 24×24 px; Apple and Google recommend 44–48 px. CKAuth's header controls are 40 px on phones.

## Growth and legal

**Conversion rate.** The share of visitors who take the action a page is built for. For CKAuth's landing page, that's creating an account: 30 sign-ups from 1,000 visits is a 3% conversion rate.

**Referral tag (`?ref=`).** A label added to the links in our own posts, such as `https://ckauth.chiragdev.com/?ref=x` on X, so the site can tell which place a visit came from. CKAuth counts tagged visits per day and keeps the tag on accounts created in that tab, which gives a sign-up rate per place (`signUps / visits` in `GET /admin/stats`). Only known tags count; see `src/app/metrics/sources.ts`.

**Attribution.** Crediting a result (here, a sign-up) to what caused it. CKAuth uses *first touch*: an account keeps the tag of the visit that first brought the person, even if they sign up again later.

**CTA (call to action).** The button or link that asks the visitor to act, such as "Create your free account". A page converts best with one main CTA, repeated, rather than several competing ones.

**Friction.** Anything that makes acting harder: extra form fields, a required card, unclear cost. The reassurance line under CKAuth's buttons ("No card required") removes the most common worries before the click.

**Privacy policy.** A public page saying what personal data a service collects, why, who it's shared with, how long it's kept and how people can use their rights. CKAuth's is at `/privacy` and must match what the code does.

**Terms of service.** The rules for using a service and the limits of the provider's responsibility. CKAuth's are at `/terms`.

**Personal data.** Any information about an identifiable person, such as a name, an email address or an IP address.

**Data processor.** A company that handles personal data on another company's behalf, such as Resend sending CKAuth's emails or ImageKit storing its photos.

**DPDP Act.** India's Digital Personal Data Protection Act, 2023: the law on how services handle Indians' personal data. It gives people the right to see, correct and erase their data and to complain to the Data Protection Board of India.

**MAU (monthly active users).** The number of different users who sign in or otherwise use an app in a calendar month. Most auth providers price by it. Clerk counts *monthly retained users* instead, which leaves out people who sign up and never come back. See the [market review](MARKET.md#the-competition).

**Free tier (freemium).** A plan that costs nothing up to a limit, so people can try a product and pay only once they grow. The limits decide what pushes someone to pay.

**Activation.** The moment a new user gets real value from a product, not just an account. For CKAuth it's a website connected and its first user signed in through CKAuth; a sign-up that never connects a site hasn't activated.

**SLA (service-level agreement).** A written promise about how reliable a service will be, such as "up 99.9% of the month", usually with refunds when it isn't. Businesses often require one before trusting a provider with sign-in.

**SSO tax.** The practice of reserving single sign-on, or other basic security features, for the most expensive plans. It's widely criticised, because it makes being safe a luxury.

**SAML.** An older single sign-on standard, built on XML, that large companies use to let staff sign in to work apps with their company account. Enterprise buyers often expect it alongside OIDC.

**SOC 2.** An independent audit of how a company protects customer data, common in the US. Larger customers often ask for a SOC 2 report before buying.

**Unit economics.** What one unit of a business, such as one customer, costs and earns. It shows whether each customer makes money before counting the fixed bills. See the [market review](MARKET.md#unit-economics).

**Fixed and variable costs.** A *fixed cost* is paid whatever the number of customers, like the server; a *variable cost* grows with use, like each email sent or each payment's fee.

**Contribution.** A customer's price minus the variable costs of serving them: what's left over to pay the fixed costs.

**Break-even.** The point where total contribution equals the fixed costs, usually stated as a number of customers. Below it the business loses money each month; above it, it makes some.

**GST (Goods and Services Tax).** India's tax on sales, 18% for software services. A service business must register once its yearly turnover passes ₹20 lakh, and may register earlier.

**LUT (Letter of Undertaking).** A yearly form on India's GST portal that lets a registered business sell services abroad at 0% GST instead of paying the tax and claiming it back.

**Uptime and "the nines".** The share of time a service is reachable, usually written as a number of nines: 99.9% ("three nines") allows about 44 minutes of downtime a month, 99.99% about 4. Each extra nine cuts the allowed downtime tenfold. See the [market review](MARKET.md#servers-speed-and-uptime).

**Vertical and horizontal scaling.** *Vertical* means a bigger server (more CPU and memory); *horizontal* means more servers sharing the work. Only horizontal scaling lets a service survive one server dying.

**Failover.** Switching traffic to a standby server when the main one fails, either by hand or automatically through a health-checked load balancer. In an *active-passive* set-up only the main server serves until then; in *active-active* both serve all the time.

**Database replication (streaming).** A second Postgres server receiving every change from the main one as it happens, so it holds an up-to-date copy and can take over after a failover.

**Zero-downtime deploy.** Releasing a new version without any moment where the service is unreachable: the new copy starts and passes its health check before the old one stops.

