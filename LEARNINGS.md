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

## Process

- Commit messages for behaviour or security changes need a body explaining *why*, plus a `BREAKING CHANGE:` footer when the API changes. One-line messages are only for trivial commits.
- After a change, test the real flow end to end against the database and the external services, not just a successful build.
