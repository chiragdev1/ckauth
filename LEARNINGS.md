# Mistakes & Learnings

Every real mistake made while building CKAuth, grouped by topic, with the rule it taught us. For the timeline, see [DEVLOG.md](DEVLOG.md); for unfamiliar terms, see the [glossary](docs/GLOSSARY.md).

**How to read an entry:**

- **What went wrong:** the mistake, and why it mattered.
- **→ Fix:** what we changed. Codes like `ca53b11` are the commits.
- **Rule:** the habit that stops it from happening again. The rules are the part worth remembering.

---

## Passwords

- **Hand-rolled password hashing.** Passwords were hashed with HMAC-SHA256 plus a salt (`19553f4`). SHA-256 is built to be *fast*, so anyone holding a leaked database could test billions of guesses per second.
  → Switched to bcrypt, which is slow on purpose (`ca53b11`).
  **Rule:** hash passwords with a deliberately slow function (bcrypt or argon2), never a general-purpose hash.
- **Logged the raw password.** Sign-up ran `console.log("password", password, ...)` (`19553f4`). Logs get copied, stored and read by many people, so a password in a log is a leaked password.
  → Removed.
  **Rule:** never log passwords, tokens, secrets or full request bodies on auth routes.

## Tokens & sessions

- **Refresh tokens stored as plain text** (`95f7b62`). A database leak would have handed out working sessions.
  → Stored as SHA-256 hashes (`5c4c505`).
  **Rule:** store every long-lived token hashed (refresh, reset, verification), just like passwords. SHA-256 is fine here, unlike for passwords, because these tokens are long and random, so there's nothing to guess.
- **Unsafe cookie settings** (`95f7b62`). `SameSite` decides whether the browser sends a cookie when *another* site triggers the request:
  - Sign-in wrote its cookie options inline (`SameSite=None`, `Secure` always on) and ignored the shared `cookieOptions`.
  - `SameSite=None` sends cookies on every cross-site request, which invites CSRF (a malicious site making your browser act on another site where you're signed in).
  - The unused `cookieOptions` paired `None` with `Secure` off in development, a combination browsers reject.

  → One shared `cookieOptions`, with `SameSite=Lax`, `Secure` in production, and the expiry taken from the token (`ca53b11`).
  **Rule:** define cookie options in one place. Default to `httpOnly` + `SameSite=Lax` + `Secure` in production. Use `None` only for genuine cross-site setups, and only together with `Secure`.

- **One refresh token per user meant one device.** `users.refresh_token` held a single session, so every sign-in silently ended the last one, and logout couldn't stop an access token that was already issued.
  → A `sessions` table, and the access token carries its session ID, which `authenticateToken` checks on every request.
  **Rule:** model sessions as rows, not a column on the user. If the access token names its session, ending the session ends the token.

## Account enumeration (revealing who has an account)

- **Sign-in revealed which emails exist.** It returned 404 for an unknown user and 403 for a wrong password (`2623376`), so anyone could test an email list against it.
  → One `401 "Invalid email or password"` for both.
- **Sign-up revealed which emails exist.** It returned `409 "email already exists"`, plus the new user's `id` when it succeeded.
  → Always `201 "check your email"`; the real owner learns the difference by email (`83025f2`).

  **Rule:** every auth endpoint answers the same way whether or not the account exists: same status, same body, similar response time. Explain differences by email, where only the inbox owner can read them.

## Email verification

- **The verification link didn't match its route** (`09f6ed8`, `c50d2fb`):
  - The email linked to `GET /auth/verify-email?token=` on the API, but the route was `POST /verify-email/:token`.
  - The route also required the user to be signed in already, which they can't be before verifying.

  → The link now opens a frontend page, which sends the token to the API; no sign-in needed.
  **Rule:** test every email link end to end. Links should open a page, never perform an action on a plain GET, because email scanners open links automatically and would use up the token.
- **A failed email failed the request.** Sign-up and sign-in waited for the email to send (`09f6ed8`), so a Resend outage meant nobody could sign up.
  → Emails are now fire-and-forget (sent in the background, with errors logged instead of returned), and the user can ask for a new link.
  **Rule:** a side effect can run fire-and-forget only if it can be retried, and the response must not depend on it.
- **Sign-in sent a verification email every time** an unverified user tried to sign in.
  → Only when the last link has expired, checked and updated in one database statement.
- **Pre-account takeover.** An attacker could sign up with someone else's email and their own password. When the real owner clicked the verification link, the account was verified *with the attacker's password*.
  → Sign-in requires a verified email, verifying requires the sign-up password, and verifying signs out earlier sessions (`83025f2`).
  **Rule:** a verified email proves who owns the inbox, not who chose the password. Fix this before adding "Sign in with Google" or any login that links accounts by email.

## Concurrency (requests arriving at the same time)

- **Check, then insert.** "Look up the email, then insert if it isn't there" is the *check-then-act* pattern: two simultaneous requests can both pass the check and both insert, a race condition.
  → `onConflictDoNothing` on the unique email column (`ca53b11`).
- **Rate-limiting emails.** "Read when the last email was sent, then send" lets simultaneous requests both send.
  → One conditional update, `UPDATE … WHERE expired … RETURNING`, which changes the row only if the condition still holds and returns it if it did. Only the request that gets a row back sends.
- **Replacing avatars.** Two uploads at once could both read the same old file, leaving one orphaned file behind.
  → Lock the user's row (`SELECT … FOR UPDATE`, which makes other requests wait) in a transaction (a group of changes that succeed or fail together), and only after the ImageKit upload has finished.

  **Rule:** let the database decide races, with unique constraints, conditional updates and row locks, never with "check, then act" in app code. Keep slow network calls outside transactions, so locks are held briefly.

## File uploads

- **Trusting the client.** The browser-reported file type and extension can be anything.
  → Check the real type from the file's first bytes, reject before saving, and check the session before reading the file at all.
- **User IDs in public URLs.** Avatar filenames were `<userId>.png`, which exposed internal IDs through public image URLs.
  → Random UUID filenames, with a `user:<id>` tag for searching in ImageKit's dashboard.
- **Orphaned files.** Every failure path must clean up files already uploaded to cloud storage: delete the new file if saving to the database fails, and delete the old one after a successful switch.

## Config & tooling

- **`toISOString()` gave the wrong date.** The docs-page schedule used it for "today", which is UTC, so late evenings counted as tomorrow.
  → Dates are built from local parts.
  **Rule:** for a date a person reads, use local time; `toISOString()` is UTC.

- **`.env.sample` was ignored by git.** The `.env.*` pattern caught the template file too.
  → Added `!.env.sample`.
  **Rule:** after adding an ignore pattern, check it with `git check-ignore -v <file>`.
- **A real value in the sample file.** The production sender address was in `.env.sample`.
  → Replaced with placeholders.
- **Migration generated but not applied.** The code expected columns the database didn't have yet.
  → Running `pnpm db:migrate` is part of "done".
- **A typo in a route handler reached a commit** (`36e8342`).
  **Rule:** run `pnpm build` (the type check) before every commit.
- **The backend `tsconfig` compiled the frontend.** With no `include`, TypeScript picked up `frontend/**` as well.
  → Added `"include": ["src"]`.
  **Rule:** when one package sits inside another, the outer package's `tsconfig` must list what it compiles.
- **The frontend built locally but failed in CI.** `vite.config.ts` uses `process.env`, but only the root (API) package depended on `@types/node`. On the laptop, TypeScript found it in `../node_modules`; CI installs `frontend/` on its own, so it wasn't there.
  → Added `@types/node` to `frontend/package.json`.
  **Rule:** a nested package must declare every dependency itself. Check with a clean copy (`git archive`) that installs only that package, as CI does.
- **The first VPS script would have locked out the admin.** It turned off root SSH, but the only remaining user (`deploy`) had no `sudo`, so nobody could have administered the server.
  → A separate `chirag` admin user with `sudo`; `deploy` is for CI only.
  **Rule:** before turning off a way in, make sure another way in with the same powers exists, and test it from a new terminal.
- **SSH password logins stayed on after hardening.** The script wrote `PasswordAuthentication no` to `sshd_config.d/99-hardening.conf`, but `sshd` keeps the *first* value it reads, and Hostinger's `50-cloud-init.conf` loads earlier with `yes`. The server kept accepting passwords for `chirag`. It only came to light when a failed key login fell back to a password prompt.
  → Renamed the file to `00-hardening.conf`. The script now checks the settings actually in force (`sshd -T`) and fails if they're wrong.
  **Rule:** for `sshd`, unlike most programs, the first value wins, so settings that must win go in a file that loads first (`00-`). Verify the settings in force (`sshd -T`, or the login methods `ssh -v` reports), not just the file you wrote.
- **Piping data into `ssh host "sudo …"` can't work.** Without a terminal, `sudo` can't ask for the password; with `-t`, it reads the piped data *as* the password.
  → Put the data in the command itself (`ssh -t vps "echo '$(cat key.pub)' | sudo tee -a …"`), leaving the keyboard free for the password prompt.
  **Rule:** a remote `sudo` that may ask for a password gets `ssh -t` and nothing piped into it.
- **The edge proxy ignored `ACME_EMAIL`.** The docs said to put it in `/opt/edge/.env`, but Docker Compose only uses `.env` to fill `${...}` placeholders in `compose.yml`. Nothing passed the value into the container, so Caddy used its default address.
  → `environment: ACME_EMAIL: ${ACME_EMAIL:-…}` in `deploy/edge/compose.yml`.
  **Rule:** a value in a Compose `.env` file reaches a container only through `environment:` or `env_file:`. Check with `docker compose exec <service> env`.
- **The web container never started in production.** The official `caddy` binary carries a file capability (`cap_net_bind_service`, a piece of root's power attached to the program file). With `cap_drop: [ALL]` and `no-new-privileges`, the kernel refuses to run it, so the container looped on `exec /usr/bin/caddy: operation not permitted` and failed its health check on the first deploy. Its tmpfs mounts (in-memory scratch folders) were also owned by root, so Caddy (running as user 65534) couldn't write to them.
  → `RUN setcap -r /usr/bin/caddy` in `frontend/Dockerfile` (port 8080 needs no capability), and `uid=65534,gid=65534` on the tmpfs mounts.
  **Rule:** run an image once with its production `cap_drop`, `user` and `read_only` settings before the first deploy, and check the main program of any image you drop capabilities from with `getcap`.

- **The pre-PR checks were never committed.** They were written on 23 Oct, then stashed with "discarded work" and forgotten. For ten days nothing checked the site, and both its title rule and its JavaScript budget went stale before anyone noticed.
  → Restored from the stash, the stale rules updated, all of it committed.
  **Rule:** commit tooling (checks, scripts, configs) on its own as soon as it works, separately from the feature work around it. A stash is not storage.
- **`tsx` was in the lockfile but not installed.** `node_modules` had drifted from `pnpm-lock.yaml`, so the first test run failed with "Cannot find package 'tsx'".
  → `pnpm install --frozen-lockfile`.
  **Rule:** when a package that's in the lockfile can't be found, sync `node_modules` before you suspect the code.
- **`pnpm update` left two vulnerable packages.** `body-parser` and `qs` come in through Express, and `pnpm update <name>` only moves direct dependencies.
  → `pnpm update --depth Infinity body-parser qs`, then `pnpm audit` again.
  **Rule:** after updating for an audit, run the audit again. Indirect packages need `--depth Infinity`.

## Testing

- **A new check flagged good input.** The rule against naming local-only docs fired on the new, legitimate `ROADMAP.md` because "ignored" was judged from what git already tracked.
  → "Committable" now means tracked, or new and not ignored.
  **Rule:** run a new check against good new input as well as bad, not only to see it fail.

- **A dev-only page shipped to production.** The route was gated on `LAB_ENABLED`, imported from `design-lab.tsx`. Vite replaces `import.meta.env` values only where they're written, and the bundler didn't fold the imported constant, so the page was bundled and the home page went over its JavaScript budget.
  → Write `import.meta.env.DEV || …` in place at the gate, and `check-dist.js` fails any build that contains the page.
  **Rule:** gate dev-only code on `import.meta.env` written in place, and add a build check that proves it's gone.
- **A dark-mode preview that wasn't dark.** Setting `color-scheme: dark` on an iframe didn't change `prefers-color-scheme` inside it, so the "dark" emails rendered light. Opening one email directly with dark mode emulated showed the CSS itself was fine.
  → The preview rewrites the email's `@media (prefers-color-scheme: dark)` to `@media all`.
  **Rule:** when a preview disagrees with expectations, test the thing being previewed on its own before trusting the harness.

- **A raw subquery in Drizzle matched against the wrong table.** `sql\`… where ${sessionsTable.userId} = ${usersTable.id}\`` printed bare column names, so `id` meant `sessions.id` and every admin row showed 0 devices. A second bug hid behind it: decoding the zone-less `timestamp` with `new Date(value)` read it as local time, 5½ hours off in India.
  → Hand-qualified names (`s.user_id = "users"."id"`) and `.mapWith(sessionsTable.lastUsedAt)` to reuse the column's own decoding.
  **Rule:** in raw SQL that mentions two tables, qualify every column yourself, and decode values with the column they came from.
- **State read once in a component that never unmounts.** The account-deleted notice read `location.state` in a `useState` initialiser inside the layout, which stays mounted across pages, so it read the state on the dashboard and never again. Behind it, clearing the user before navigating let `RequireAuth` redirect to sign-in first.
  → Watch the state in an effect, and navigate away before clearing the user.
  **Rule:** anything in a layout must react to navigation, not read it at mount; and leave a guarded page before removing what its guard checks.
- **Revoking an object URL in cleanup failed the image it was loading.** In development, React's strict mode runs effects twice: the first run's cleanup revoked the URL mid-load, its `onerror` fired, and the cropper said every photo "can't be opened".
  → Each effect run ignores its own events once cleaned up.
  **Rule:** async callbacks started in an effect must check that the effect is still current before setting state.

- **Cancel buttons needed a second click.** Pressing Cancel first blurred the focused, still-empty field; `useForm` shows a field's error on blur, the error pushed the button down, and the click landed beside it. Only a real browser run caught it.
  → Cancel buttons keep focus where it is on mouse down (`keepFocus` in `dashboard.tsx`); keyboard users still tab to them as normal.
  **Rule:** a button that sits below a field validated on blur must not move when the field blurs; either keep focus on press, or reserve the error's space.

- **The admin API could create admins it couldn't remove.** Removing an admin was deliberately server-only, but `POST /admin/users` accepted `role: "admin"`, so a stolen session could plant extra admins.
  → Invites are always `user`, and the payload is `.strict()`.
  **Rule:** guard granting a power at least as strongly as revoking it.

- **The test database's name clashed with another branch's.** The suite first used `<dev database>_test`, which another branch's tests already owned with a different schema. The run applied this branch's `role` migration to it, before a `TRUNCATE` without `CASCADE` stopped it from emptying that database's tables.
  → The suite uses its own fixed name, `ckauth_test`, and keeps `TRUNCATE` without `CASCADE` as a guard.
  **Rule:** give each suite a database name nobody else derives, and never point a migrator at a database you didn't create.
- **Every test failed on "Cannot use a pool after calling end".** `startApp()` registered its `after()` cleanup while running inside a `before()` hook, and `node:test` attaches an `after()` to whatever is running at the time. So the cleanup ran as soon as the hook finished, before any test.
  → `const baseUrl = await startApp()` at the top level of each file.
  **Rule:** register `after()` cleanups at a test file's top level (or inside the `describe` they belong to), never from inside another hook.
- **A concurrency test passed for the wrong reason.** "Two deletes at once, exactly one wins" would have passed without the role check, because a single `DELETE` is atomic anyway. The race that mattered (a promotion landing between a check and the delete) was never exercised.
  → The test now holds the promotion's row lock on a second connection, so the delete really has to wait, and it fails against a check-then-delete version.
  **Rule:** to test a race, force the bad timing (a held lock, a second connection), then show the test fails against the naive code.
- **"Fails open" hid a 5-second stall.** With Redis unreachable, the limiter did let requests through, but node-redis queued each command first, so every sign-in waited about 5 s.
  → `disableOfflineQueue: true`, and `test/redis-down.test.ts` asserts the request is fast as well as successful.
  **Rule:** when testing a fallback, assert how long it takes, not only that it works.
- **A new limiter broke an old test through its fallback key.** Adding a per-email limit to sign-up made "10 sign-ups per IP" fail at the 6th: the test sent empty bodies, and with no valid email `emailKey` falls back to the IP, so the per-email limit (5) counted them first.
  → The per-IP test sends a different valid email each time, like the forgot-password one.
  **Rule:** when two limiters guard one route, test each with input only it counts, and remember what a key falls back to.
- **A check that can't fail proves nothing.** → Every new test and check here was proven by breaking the code once on purpose: deleting the admin-role condition, removing `/admin` from the Caddyfile.
  **Rule:** before trusting a new test or check, make it fail once.

- **A "break it once" check that didn't break anything.** To prove the audit row commits with its action, the event was written with `db` instead of `tx`, and the test still passed: the failing insert threw inside the transaction callback, so the transaction rolled back anyway. The way the guarantee really breaks is writing the record after the commit, and that version failed the test.
  → The proof now moves the write after the commit.
  **Rule:** break the code the way it would really go wrong, not just in some way; a break that leaves the test green proves nothing about the test.

## Performance

- **Password hashing on the main thread capped the whole API.** `bcryptjs` is pure JavaScript, so each ~60 ms hash ran on Node's only JavaScript thread, the event loop, and blocked it. Sign-in topped out at 17 per second, and a burst of sign-ins delayed every other request.
  → Native `bcrypt`, which hashes on libuv's thread pool (Node's background worker threads).
  **Rule:** CPU-heavy work (hashing, image processing, compression) must run off the main thread: a native or async implementation that uses the thread pool, or a worker.
- **"Zero errors" hid a collapse.** At 2,000 people online every request still succeeded, but the p95 (the time within which 95% of requests finished) was 12 seconds: demand outran capacity, and the queue kept growing.
  → Judge load tests by p95/p99 response times, not by error rate.
  **Rule:** a load test passes on latency targets, not on success counts.
- **A smaller thread pool made things worse.** Limiting `UV_THREADPOOL_SIZE` (the number of libuv threads) to 1, to keep bcrypt to one core, slowed real users (p50 1.56 s vs 0.73 s), because database reconnects also look up hostnames on that pool.
  → Kept the default of 4.
  **Rule:** measure a tuning change before keeping it. The thread pool is shared by DNS lookups, file access and crypto.
- **A load test with fake emails missed both the cost and a leak.** Bots using made-up emails never reached bcrypt, because unknown emails returned early. That made the attack look cheap, and hid a timing difference (16 ms vs 60 ms) that revealed which emails had accounts.
  → Reran the test against real accounts.
  **Rule:** attack simulations must use realistic inputs (real usernames for credential stuffing, the attack that replays email/password pairs leaked from other sites). Response *time* must not depend on whether an account exists.
- **Default keep-alive timeouts would have caused random 502s.** Keep-alive reuses one connection for many requests. Node closes idle connections after 5 s, while Caddy reuses upstream sockets (its connections to the app) for much longer, so a POST could land on a socket Node had just closed.
  → `keepAliveTimeout` of 125 s in Node; Caddy closes idle connections after 60 s.
  **Rule:** behind a proxy, the app's idle timeout must be longer than the proxy's.
- **Email-link lookups scanned the whole users table.** Verify-email, reset-password and confirm-email find the user by a token column, and none of the three had an index, so each click read every row. Small tables hid it.
  → Partial indexes on each token column (`WHERE … IS NOT NULL`), holding only users with a pending link.
  **Rule:** every column a request filters on gets an index in the same change that adds the query. For optional values, a partial index keeps it small.
- **An explain plan on an empty database proved nothing.** On the empty test database Postgres chose a full scan even for `email`, which has a unique index, because scanning zero rows costs nothing.
  → Checked `pg_indexes` for what exists, and ran `EXPLAIN` with `enable_seqscan = off` to see whether an index *can* serve the query.
  **Rule:** judge indexes by what exists and what the planner can use, not by the plan it picks on a near-empty table.
- **A 0.5 KiB helper pushed the home page over its JavaScript budget.** The `?ref=` capture was imported in `main.tsx`, so every visitor downloaded it, though only visitors from a tagged link use it. The home bundle went from 127.0 to 127.1 KiB, over its 127 KiB budget, and `check-dist.js` failed.
  → `main.tsx` imports it with a dynamic `import()` only when the address has `?ref=` (938dd21).
  **Rule:** code that only some visits need loads behind the condition that needs it, not in the entry file. Don't raise a budget for it.
- **The home page paid for every page's CSS, and the cause was guessed wrong.** Tailwind builds one stylesheet from every source file and the home page inlined all of it, so the dashboard, admin and consent screen grew the landing page until it sat 8 bytes under its 22.5 KiB budget. The task list blamed the dev-only preview pages; measuring showed they were 1.3 of about 18 KiB of CSS the home page never uses. The budget gave no notice before it was used up.
  → Critical CSS (`scripts/critical-css.js`): the home page inlines only the rules its markup and first-load JavaScript use (22.5 → 19.0 KiB), and loads the full sheet at the end of `<body>`. `check-dist.js` proves no class lost its style, prints the CSS/markup split, and warns before a budget runs out. Compared pixel for pixel against the old page in Chromium and Firefox, light and dark, phone and desktop, signed in and out.
  **Rule:** budget what a page uses, not what the site has. Measure the breakdown before naming a cause. Every size optimisation gets a check that it can't cost behaviour, and every budget warns before it fails.

## Logging

- **The request log lost its route prefix exactly on errors.** The first version logged `${req.baseUrl}${req.route.path}`. When a handler throws, the error leaves the router and Express 5 resets `req.baseUrl` to `''`, so failed requests were logged as `/me` instead of `/auth/me`. The level rules match `/auth/me`, so the two routine `401`s of every signed-out visit came out at `info` instead of `debug`. Reading the code didn't show it; ten real requests did.
  → The mount prefix is taken from the URL itself: everything before the template's own segments.
  **Rule:** build a log line from what is still true when the response finishes, and check it against real requests, including failing ones, before trusting it.
- **The default access log would have written every session cookie.** pino-http's default `req` serializer logs all headers, and `cookie` holds the access and refresh JWTs. Logging `req.url`, as most examples do, would also have stored every single-use token, since they travel in paths (`/verify-email/:token`). Caught while writing the logger, before it shipped.
  → An allow-list of six fields, the route template instead of the URL, and `redact` as a second line of defence.
  **Rule:** a logger's fields are an allow-list; never log a whole request, headers object or URL on an auth server.

## SEO

- **The SPA fallback answered 200 for every address.** A single-page app needs unknown paths to load `index.html`, so the router in the browser can draw them. But `try_files {path} /index.html` meant `/robots.txt`, `/sitemap.xml` and every misspelled URL returned the app with status 200. Search engines count those as "soft 404s", and the site had no way to say "this page doesn't exist".
  → List the app's routes in the Caddyfile and serve the app shell for them; everything else gets a real 404 that still shows the 404 page.
  **Rule:** a catch-all fallback must still return 404 for addresses the app doesn't know. Check with `curl -I` on a made-up URL.
- **A page drawn by JavaScript looks empty to most crawlers.** Only Google runs the JavaScript, and later than the rest; link previews never do.
  → Prerender the public page (render it to HTML at build time) and hydrate it (React takes over the finished HTML in the browser).
  **Rule:** anything meant to be found or shared (content, title, meta description, Open Graph tags, which control link previews) must be in the HTML the server sends. Check with `curl`, not in the browser.
- **A fade-in made the main heading count as late.** The hero started at opacity 0 and faded in over 700 ms. The HTML had arrived, but Chrome doesn't count text as painted until it's visible, so 80% of LCP (Largest Contentful Paint, when the main content appears) was waiting for the animation.
  → Keep the slide-in, drop the fade.
  **Rule:** the first screen's main text must be visible on the first frame. Animate position if you like, never opacity from 0.
- **"Unused JavaScript" was mostly a menu nobody signed-out could open.** The account dropdown pulled Radix and Floating UI (the library that positions popups) into the bundle every visitor downloads.
  → Lazy-load it (`React.lazy`), so only signed-in users fetch it.
  **Rule:** UI only some users see (signed-in menus, dialogs, editors) goes in a lazy chunk if it brings a library with it.

## Languages

- **Hindi was harder to read than the English beside it.** Same font size, line height and letter-spacing as English, with the system's fallback font. Devanagari letters hang from a top line and carry marks above and below, so at the same size they looked a size smaller, the lines crowded each other, and letter-spacing cut the top line into pieces.
  → Bundle Noto Sans Devanagari, scale it with `size-adjust: 112%`, load it only for Devanagari characters (`unicode-range`), and give `:lang(hi)` taller lines, no letter-spacing, slightly bigger small text and darker grey text.
  **Rule:** a second script needs its own typography, not just a translation. Mark the text with `lang`, and tune size, line height and spacing for that script.
- **Hindi cost every visitor, though few switched.** The Hindi copy shipped in the home page's first-load JavaScript for everyone (about 3.3 KiB gzip of the 4 KiB it saved, with the switch and its provider), and the home page sat at its 127 KiB budget.
  → Removed on 7 Nov 2026 (copy, switch, font, `:lang(hi)` styles), checked pixel for pixel against the English page before it.
  **Rule:** a translation that comes back loads on demand (a dynamic `import()` when the language is chosen), never in the first-load bundle.


## Frontend UX & accessibility

- **A placeholder shipped as a feature.** `scorePassword()` was left as a `TODO` that returned 2 for every password, and it reached production. The meter said "Holding" for `a` and for a 40-character passphrase alike, on every page with a new password, while the landing page promised "a meter shows how strong the password is".
  → A real scorer: length first, a bonus for mixing character types, and 0 for repeats, runs (`1234`) and leaked words (`password`).
  **Rule:** a stub must fail loudly (throw, or hide the feature), never return a plausible value. Search for `TODO` before every merge.
- **The reduced-motion reset made the ticker flicker.** The usual rule sets `animation-duration: 0.01ms`, but the marquee runs `infinite`, so it looped 100,000 times a second and landed on a random spot every frame, for exactly the users who asked for less motion.
  → `animation-iteration-count: 1` in the same rule, plus a pause button on the ticker (WCAG 2.2.2: anything that moves for more than 5 seconds needs a way to stop it).
  **Rule:** a "turn animations off" rule needs both duration and iteration count. Check every `infinite` animation with reduced motion on.
- **A deploy broke tabs that were already open.** Lazy pages are hashed files that each deploy replaces, and the router had no `errorElement`, so a visitor who opened the home page before a deploy and then clicked "Sign in" got React Router's raw "Unexpected Application Error!".
  → `pages/route-error.tsx` as the error element (inside the layout), and one automatic reload on `vite:preloadError`.
  **Rule:** with code-splitting, a missing chunk is a normal event, not a bug. Give the router an error screen, and reload once when a chunk is gone.
- **The page promised what a new sign-up couldn't find.** The FAQ said a shop owner needs no code, but the dashboard had nothing to connect a website to, so every conversion ended at a dead end.
  → An honest FAQ answer (a developer sets it up today; no-code is coming) and a "Connect your website · Coming soon" card on the dashboard.
  **Rule:** walk the funnel after every copy change: each promise on the landing page must be something a new account can find on the dashboard, or be labelled as coming.
- **An SPA forgets what a full page load does for free.** With no `<ScrollRestoration />`, a footer link opened the next page at the old scroll depth. Focus stayed on the clicked link, and when "Create account" swapped the form for "Check your inbox", focus fell to `<body>` without a word to screen readers.
  → `<ScrollRestoration />`, focus on `<main>` after each navigation, and focus on the new heading when an auth page swaps views.
  **Rule:** after any client-side navigation or view swap, decide where scroll and focus go. The browser only decides for you on a real page load.
- **The loudest pricing card was a dead end.** "Best value" highlighted the yearly plan, which is "Coming soon" and disabled.
  → The highlight follows the first plan you can pick ("Available now").
  **Rule:** visual emphasis goes to an action people can take today.

- **A long email widened the whole admin page on phones.** The users list was `grid` with columns only from `sm:` up, so on phones its single column was an automatic track, which grows to its widest item's content. `truncate` with `min-w-0` stopped the email overflowing its own box but not widening the track, so `walkthrough.invitee@seed.example.com` pushed the page 36–78 px sideways at 320 px. It only showed up once the seed data had long addresses.
  → `grid-cols-1` (`minmax(0, 1fr)`) on phones, and `break-all` on emails in running text.
  **Rule:** give every grid an explicit column template at every width, and test phone widths with the longest realistic data, not the shortest.
- **Fixed column widths left an empty strip.** Moving the activity table to `table-fixed` with set widths for When and Event made every filter look the same, but Details took all the rest, so short sentences left a wide blank on the right. The look the user liked (one person's log) came from the content: short, balanced cells that the browser's automatic layout spread evenly.
  → Back to automatic layout.
  **Rule:** uneven table spacing is a content problem first. Balance what each column holds before reaching for widths.

## Process

- **The same validation block was pasted into 16 handlers**, along with three copies of the "safe user fields" select and five of the token hash. The frontend parses that validation message to place field errors, and the field list decides what a client may see, so one copy drifting would have broken forms or leaked a column.
  → `parseOrThrow`, `safeUserColumns` and `tokens.ts`, each the only copy.
  **Rule:** when the same lines appear a third time, make them a helper, and sooner when other code depends on their exact output or they guard what leaves the server.

- **A design the user liked was overwritten before anyone committed it.** The activity table went through a redesign that replaced the chosen version; when the user asked for it back, git had nothing, and it had to be rebuilt by hand from the conversation.
  → Rebuilt, and the branch is committed before further experiments.
  **Rule:** commit (or at least stash) a version the user has approved before trying alternatives on top of it.

- **The commit phase of long sessions was the most expensive work.** Almost all tokens (97.8%) were the session being re-read on every call, and committing at the end of a long session re-read about 341k tokens each time.
  → The commit phase became the `/ship` skill, which runs in a fresh, cheaper context and is given a short summary instead of the whole conversation.
  **Rule:** when the cost is re-reading a long session, fork the commit phase into a fresh context.

- Commit messages for behaviour or security changes need a body explaining *why*, plus a `BREAKING CHANGE:` footer when the API changes. One-line messages are only for trivial commits.
- After a change, test the real flow end to end against the database and the external services, not just a successful build.

- **A memory holding an instruction never ended.** A note said to pop a stash after a merge, and went on saying it after the stash was gone.
  → The note was removed.
  **Rule:** a memory that holds an instruction needs an end condition, and gets deleted when it is met.
