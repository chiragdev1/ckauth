# Glossary

Plain definitions of the terms used across CKAuth's docs ([README](../README.md), [API](API.md), [Deployment](DEPLOYMENT.md), [DEVLOG](../DEVLOG.md), [LEARNINGS](../LEARNINGS.md), [SEO audit](SEO-AUDIT.md)). Where it helps, each entry says how CKAuth uses the idea.

## Contents

- [Web basics](#web-basics)
- [Sign-in and security](#sign-in-and-security)
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

**Session.** The period during which a user stays signed in without re-entering their password.

**JWT (JSON Web Token).** A signed token that carries facts such as a user ID. The server can check the signature, so it can tell if anyone changed the token.

**Claim.** One fact stored inside a JWT, such as the user ID (`sub`), the expiry time (`exp`) or a unique token ID (`jti`).

**Access token.** A short-lived JWT (about 15 minutes) sent with each request to prove who the user is.

**Refresh token.** A longer-lived token whose only job is to get a new access token when the old one expires.

**Token rotation.** Replacing the refresh token every time it's used. A stolen token stops working after one use.

**Hash.** A one-way scramble of data: you can check a value against its hash, but you can't recover the value from it. CKAuth stores only hashes of passwords and tokens.

**bcrypt.** A password-hashing function that is deliberately slow, so an attacker with a leaked hash can try far fewer guesses per second. `bcrypt` is the fast native version; `bcryptjs` is pure JavaScript and blocks the server while it runs.

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

**Passkey (WebAuthn).** Signing in with the device's fingerprint, face or PIN instead of a password. Passkeys resist phishing.

**OpenID Connect (OIDC) / PKCE.** The standard protocol behind "Sign in with Google". PKCE is the part that protects the exchange in browser and mobile apps.

---

## Database

**PostgreSQL (Postgres).** The database CKAuth stores its users in.

**ORM.** A library that lets code work with database tables as objects. CKAuth uses **Drizzle**.

**Schema.** The definition of the tables and columns (`src/db/schema.ts`).

**Migration.** A file of SQL that changes the schema from one version to the next. Migrations are applied in order and never edited after release.

**Transaction.** A group of database changes that succeed or fail together.

**Unique constraint.** A database rule that a column can't hold the same value twice, such as two accounts with one email.

**Race condition.** A bug that appears only when two requests arrive at almost the same moment and interfere with each other.

**Check-then-act.** Reading a value, then deciding what to write based on it. Between the read and the write, another request can change the value, so this pattern causes race conditions.

**Conditional UPDATE.** An `UPDATE … WHERE …` that changes a row only if a condition still holds, and reports whether it did. The database itself decides which request wins.

**Row lock (`SELECT … FOR UPDATE`).** Locking a row inside a transaction, so other requests wait until you're done with it.

**`onConflictDoNothing`.** Drizzle's way of saying "insert this row, but if it breaks a unique constraint, skip it quietly".

---

## Server and performance

**Node.js.** The JavaScript runtime the API runs on.

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

**Prerendering.** Turning a page into finished HTML at build time. Visitors and crawlers then get the content without running JavaScript first.

**Hydration.** React taking over prerendered HTML in the browser and making it interactive. The browser's first render must match the HTML exactly, or React reports a *hydration mismatch*.

**Design lab.** CKAuth's development-only switcher for comparing candidate designs on the real pages (`frontend/src/lib/design-lab.tsx`).

**Devanagari.** The script Hindi is written in. Its letters hang from a line along the top (the *shirorekha*) and carry marks above and below, so it needs taller lines than English.

**`lang` attribute.** Tells the browser (and screen readers) which language a piece of the page is in, e.g. `lang="hi"`. CSS can then style that language with `:lang(hi)`.

**Error boundary.** A component that catches a crash in the pages below it and shows a friendly screen instead of a blank or raw error page. CKAuth's is `pages/route-error.tsx`, set as the router's `errorElement`.

**Stale chunk.** A lazy-loaded file that no longer exists on the server. Each deploy replaces the hashed files, so a tab opened before it can't load the next page; CKAuth reloads once to fetch the new build (`main.tsx`).

**Scroll restoration.** Starting each new page at the top, and returning to the old position on Back. A full page load does this by itself; an SPA has to do it on purpose (React Router's `<ScrollRestoration />`).

**Focus / focus management.** The focused element is the one that receives the keyboard. When an SPA swaps a page or a view, it must move focus on purpose (CKAuth moves it to `<main>` or the new heading), or keyboard and screen-reader users are left on something that has vanished.

**`unicode-range` / `size-adjust`.** Two `@font-face` settings. `unicode-range` makes the browser download a font only when the page shows characters in that range (here, Hindi). `size-adjust` scales one font so it matches the size of the fonts around it.

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

**Structured log.** A log entry written as one JSON object, such as `{"event":"signin_failed","ip":"1.2.3.4"}`, instead of free text, so tools can filter, count and alert on it. **pino** is a fast structured logger for Node; its `redact` option removes fields like `password` before anything is written.

**Audit log.** A permanent record of security-relevant actions (sign-ins, password resets, sessions ended), answering "what happened to this account?" Ordinary logs answer "is the server healthy?"

**Request ID.** A unique ID given to each request and included in every log line it produces, so all the lines for one request can be found together.

**Log rotation.** Capping how large logs grow by starting a new file at a size limit and deleting the oldest. Without it, logs eventually fill the disk.

**Retention.** How long logs or metrics are kept before being deleted.

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

**CTA (call to action).** The button or link that asks the visitor to act, such as "Create your free account". A page converts best with one main CTA, repeated, rather than several competing ones.

**Friction.** Anything that makes acting harder: extra form fields, a required card, unclear cost. The reassurance line under CKAuth's buttons ("No card required") removes the most common worries before the click.

**Privacy policy.** A public page saying what personal data a service collects, why, who it's shared with, how long it's kept and how people can use their rights. CKAuth's is at `/privacy` and must match what the code does.

**Terms of service.** The rules for using a service and the limits of the provider's responsibility. CKAuth's are at `/terms`.

**Personal data.** Any information about an identifiable person, such as a name, an email address or an IP address.

**Data processor.** A company that handles personal data on another company's behalf, such as Resend sending CKAuth's emails or ImageKit storing its photos.

**DPDP Act.** India's Digital Personal Data Protection Act, 2023: the law on how services handle Indians' personal data. It gives people the right to see, correct and erase their data and to complain to the Data Protection Board of India.
