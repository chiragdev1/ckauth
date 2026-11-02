# CKAuth

A production-minded authentication API built with **Express 5**, **TypeScript** and **PostgreSQL**.
It handles the full account lifecycle: sign-up with email verification, cookie-based sessions with refresh tokens, password reset and change, and profile avatars stored on ImageKit.

> **Building a frontend against this API?** Go straight to the **[API reference](docs/API.md)**.
> **Deploying?** See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (Hostinger VPS, Docker Compose, GitHub Actions).
> **New to auth or web hosting?** The **[glossary](docs/GLOSSARY.md)** explains every term the docs use, and **[DEVLOG](DEVLOG.md)** / **[LEARNINGS](LEARNINGS.md)** tell the story of how this was built and what went wrong.

**Live demo:** [ckauth.chiragdev.com](https://ckauth.chiragdev.com)

The repo also contains the **CKAuth web app** in [`frontend/`](frontend/) (React + Vite + Tailwind), which implements every flow in the API.

---

## Features

- **Sign-up and sign-in** with Zod validation and bcrypt password hashing.
- **Email verification** with single-use links that expire after 15 minutes, sent through [Resend](https://resend.com).
- **Session handling** with short-lived access tokens and refresh tokens that are replaced on every use, both stored in `httpOnly` cookies.
- **Password management:** forgot password, reset password and change password.
- **Roles and an admin panel:** every account is a `user` or an `admin`. Admins can search, invite and delete users at `/admin`, after confirming their password. Invited people choose their own password from an emailed link. Admins themselves are made and removed only from the server (`pnpm admin`), never through the website.
- **Avatar uploads** to [ImageKit](https://imagekit.io). The real file type is checked from the file's contents, and old images are cleaned up automatically.
- **Built with security in mind:**
  - Every token is stored hashed.
  - Responses never reveal whether an email is registered.
  - Sign-in requires a verified email.
  - Database updates are safe when requests arrive at the same time.
  - Rate limits per IP, per email and per user on every endpoint that checks a password, sends an email or uses a single-use token. They're shared through Redis.
  - Password hashing runs off the main thread, so a burst of sign-ins can't stall everyone else.

## Tech stack

| Area | Tools |
|---|---|
| Runtime | Node.js, TypeScript, Express 5 |
| Database | PostgreSQL 17 (Docker), Drizzle ORM |
| Validation | Zod |
| Auth | JSON Web Tokens (`jsonwebtoken`), native `bcrypt` (hashes off the main thread) |
| Rate limiting | `express-rate-limit` with a Redis store (`rate-limit-redis`) |
| Email | Resend |
| File uploads | Multer (in-memory), ImageKit |
| Frontend | React 19, Vite, Tailwind CSS 4, React Router |
| Hosting | Docker Compose on a Hostinger VPS behind a shared Caddy edge proxy (HTTPS), GitHub Actions → GHCR |

---

## Getting started

### Prerequisites

- **Node.js 20+** (developed on Node 24)
- **pnpm**: run `corepack enable` to use the version pinned in `package.json`
- **Docker**, for the local PostgreSQL and Redis
- A **Resend** API key (for emails) and an **ImageKit** private key (for avatars)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.sample .env
```

Then open `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port the API listens on. Default: `8080`. |
| `NODE_ENV` | No | `development` or `production`. In production, cookies are sent over HTTPS only. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. The sample value matches `docker-compose.yml`. |
| `ACCESS_TOKEN_SECRET_KEY` | Yes | Secret used to sign access tokens. |
| `REFRESH_TOKEN_SECRET_KEY` | Yes | Secret used to sign refresh tokens. **Must be different** from the access token secret. |
| `ACCESS_TOKEN_EXPIRY` | Yes | Access token lifetime, e.g. `15m`. |
| `REFRESH_TOKEN_EXPIRY` | Yes | Refresh token lifetime, e.g. `1d`. |
| `APP_NAME` | No | Product name shown in emails. Default: `CKAuth`. |
| `RESEND_API_KEY` | Yes | Resend API key (starts with `re_`). **The server won't start without it.** |
| `EMAIL_FROM` | Yes | Sender address on a domain verified in Resend, e.g. `"CKAuth <no-reply@yourdomain.com>"`. **The server won't start without it.** No domain is hard-coded, so changing mail domains is a config change. |
| `FRONTEND_URL` | Yes | Base URL of your frontend. Links in emails point here. Default: `http://localhost:3000`. |
| `IMAGEKIT_PRIVATE_KEY` | For avatars | ImageKit private API key. The server starts without it; only avatar uploads fail. |
| `REDIS_URL` | No | Redis for rate-limit counts, e.g. `redis://localhost:6379`. Without it, limits are counted in the process's memory (fine for one local process). |

Generate strong JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start the database and run migrations

```bash
pnpm db:up        # starts PostgreSQL and Redis in Docker
pnpm db:migrate   # creates the tables
```

### 4. Run the server

```bash
pnpm dev
```

The API is now running at `http://localhost:8080`. A quick check:

```bash
curl http://localhost:8080/
# {"message":"Express Application is running"}
```

### 5. Run the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The Vite dev server proxies `/api/*` to the API on port 8080 (stripping `/api`), exactly like Caddy does in production. Keep `FRONTEND_URL=http://localhost:3000` in `.env` so email links open this app.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Compiles in watch mode and restarts the server on every change. |
| `pnpm build` | Compiles TypeScript to `dist/`. Also the project's type check. |
| `pnpm start` | Runs the compiled server from `dist/`. |
| `pnpm db:up` / `pnpm db:down` | Starts / stops the PostgreSQL and Redis containers. |
| `pnpm db:generate` | Creates a new migration after you change `src/db/schema.ts`. |
| `pnpm db:migrate` | Applies pending migrations to the database. |
| `pnpm db:migrate:prod` | Applies migrations with Drizzle's runtime migrator (`dist/db/migrate.js`); used by deploys. |
| `pnpm admin <command>` | Manages roles from the command line, after `pnpm build`: `role <email> <user\|admin>`, `delete <email>`, `admins`. Use `pnpm admin role you@example.com admin` to make yourself an admin. |
| `pnpm drizzle:studio` | Opens Drizzle Studio to browse the database. |
| `pnpm docs:artifact` | Bundles every doc into one searchable page (`.docs-artifact/ckauth-docs.html`) and warns about broken links between docs. |

**Changing the database schema:** edit `src/db/schema.ts` → `pnpm db:generate` → review the SQL in `drizzle/` → `pnpm db:migrate` → commit the schema and the migration together.

---

## Project structure

```
src/
├── index.ts                    # Entry point: starts the HTTP server
├── app/
│   ├── index.ts                # Express app: middleware, routes, error handler
│   ├── auth/
│   │   ├── routes.ts           # Endpoint → middleware → controller wiring
│   │   ├── controller.ts       # Request handlers (AuthController)
│   │   ├── models.ts           # Zod schemas for request bodies
│   │   ├── middleware.ts       # authenticateToken (reads the access token cookie), authorizeRoles
│   │   └── utils/              # JWT helpers, cookie options, frontend URL, user roles
│   ├── admin/                  # /admin endpoints: stats, list, add and delete users (admins only)
│   └── middlewares/
│       ├── error-handler.ts    # Turns errors into JSON responses
│       ├── rate-limit.ts       # Rate limiters, shared through Redis
│       └── upload-multer.ts    # Avatar upload parsing and validation
├── scripts/
│   └── manage-users.ts         # `pnpm admin`: make, demote or delete admins from the server
├── db/
│   ├── index.ts                # Drizzle database client
│   ├── migrate.ts              # Runtime migrator used in production
│   └── schema.ts               # Table definitions
└── utils/
    ├── api-error.ts            # ApiError: errors with an HTTP status
    ├── api-response.ts         # ApiResponse: consistent success responses
    ├── mail.ts                 # Email sending and templates
    └── imagekit.ts             # ImageKit upload and delete
drizzle/                        # Generated SQL migrations
docs/API.md                     # API reference
docs/DEPLOYMENT.md              # Production setup, deploys, rollbacks, backups
Dockerfile                      # API image
frontend/                       # React app; frontend/Dockerfile + Caddyfile build the web image (internal static server)
deploy/                         # CKAuth compose stack, deploy script, site config, env templates, VPS setup
deploy/edge/                    # Shared Caddy proxy for every site on the VPS (owns 80/443)
.github/workflows/              # api.yml and web.yml build and deploy independently via deploy.yml
```

---

## How authentication works

1. **Sign up.** The user is created as *unverified* and receives a verification email.
2. **Verify.** The email link opens your frontend's `/verify-email?token=…` page. The user enters their password, and the frontend sends it to the API with the token. Asking for the password proves that the person who owns the inbox is the same person who signed up, so a successful verification also signs the user in.
3. **Sign in.** Only verified users can sign in. Signing in (or verifying) sets two `httpOnly` cookies:
   - `access_token`: short-lived, sent with every request.
   - `refresh_token`: longer-lived, used only to get a new access token.
4. **Refresh.** When the access token expires, call `/auth/refresh`. Both tokens are replaced, and the old refresh token stops working.
5. **Log out**, or reset or change the password, to end sessions:
   - Logging out ends the current session.
   - A password reset signs out every device.
   - A password change signs out every device except the current one.

Cookies are `httpOnly` and `SameSite=Lax`, and `Secure` in production. Frontend code never reads or stores tokens itself.

Two consequences:
- **Deploy the frontend and API on the same site.** Browsers don't send `Lax` cookies across different sites. Production uses one origin: `ckauth.chiragdev.com` serves the app and `ckauth.chiragdev.com/api/*` is proxied to the API.
- **Ending a session takes effect gradually.** The refresh token is revoked immediately, but an access token that was already issued stays valid until it expires (`ACCESS_TOKEN_EXPIRY`).

## Security notes

- Passwords are hashed with bcrypt. Refresh, verification and reset tokens are stored as SHA-256 hashes, so a database leak does not expose working tokens.
- Sign-up, sign-in and forgot-password give the same response whether or not an account exists, so the API can't be used to find out which emails are registered.
- Uploaded avatars are checked by their file contents, not the type the client claims. Files are stored under random names, so URLs don't expose user IDs.

### Known limitations

These are planned but not done yet:

- **No CORS configuration.** Not needed for the bundled frontend, which is served from the same origin. A frontend on another origin would need CORS added first.
- **Malformed or oversized (over 50 KB) JSON bodies return `500`** instead of `400`/`413`.
- **No automated tests yet.**

---

## Further reading

- **[docs/API.md](docs/API.md):** every endpoint, with requests, responses and errors.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):** production setup, deploying, rolling back and backups.
- **[docs/VPS-ACCESS.md](docs/VPS-ACCESS.md):** first-time SSH and GitHub setup for the VPS.
- **[DEVLOG.md](DEVLOG.md):** how the project was built, step by step.
- **[LEARNINGS.md](LEARNINGS.md):** mistakes made along the way, and the rules learned from them.
