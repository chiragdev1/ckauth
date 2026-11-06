# Deploying CKAuth

This guide takes you from an empty Hostinger VPS to CKAuth running at **`https://ckauth.chiragdev.com`**, with every push to `main` deploying itself. It's written for someone doing this for the first time. Follow the steps in order, and don't skip the **✅ Check** at the end of each one. Each check catches its step's mistakes while they're still easy to fix. Terms such as VPS, container, reverse proxy and DNS record are defined in the [glossary](GLOSSARY.md).

**Time:** about 1–2 hours the first time, most of it waiting for DNS.

---

## Contents

- [How to read this guide](#how-to-read-this-guide)
- [Part A: How it works](#part-a-how-it-works)
- **[Part B: First-time setup](#part-b-first-time-setup)**
  1. [Collect what you need](#step-1-collect-what-you-need)
  2. [Point the domain at the VPS](#step-2-point-the-domain-at-the-vps)
  3. [Prepare the VPS and SSH access](#step-3-prepare-the-vps-and-ssh-access)
  4. [Start the shared web proxy](#step-4-start-the-shared-web-proxy)
  5. [Set up email sending](#step-5-set-up-email-sending)
  6. [Create the settings files on the VPS](#step-6-create-the-settings-files-on-the-vps)
  7. [Connect GitHub to the VPS](#step-7-connect-github-to-the-vps)
  8. [First deploy](#step-8-first-deploy)
  9. [Check everything works](#step-9-check-everything-works)
  10. [Turn on backups](#step-10-turn-on-backups)
- **[Part C: Everyday operations](#part-c-everyday-operations)**: deploying, rolling back, settings, **changing the email domain**, secrets, migrations, **admins**, logs, restoring, other sites, **resource budget and capacity**, server updates
- [Part D: Troubleshooting](#part-d-troubleshooting)
- [Part E: Reference](#part-e-reference)

---

## How to read this guide

**Where each command runs:**

| Label | Means |
|---|---|
| 💻 **laptop** | A terminal on your own computer, in the repo folder unless it says otherwise |
| 🖥️ **VPS** | A terminal logged in to the server (`ssh vps`) |
| 🌐 **browser** | A website: hPanel, GitHub, Resend, your DNS provider |

**Placeholders.** Replace these with your own values everywhere they appear:

| Placeholder | Means | Where to find yours |
|---|---|---|
| `203.0.113.10` | The VPS's IP address. This is a documentation-only address and never a real server. | hPanel → VPS → Overview |
| `ckauth.chiragdev.com` | The address of the app | Your choice (already set in the repo) |
| `yourdomain.com` in email addresses | The domain emails are sent from | Whatever you verify in Resend ([step 5](#step-5-set-up-email-sending)) |

**Commands** in code blocks are meant to be copied whole. Lines starting with `#` are explanations; the shell ignores them.

---

## Part A: How it works

You'll understand the steps better if you know what you're building.

### The big picture

```
  Visitor's browser
        │  https://ckauth.chiragdev.com/...
        ▼
┌─────────────────────────── VPS (Hostinger KVM 2, Ubuntu 24.04) ───────────────────────────┐
│                                                                                           │
│   ┌────────────────────────────────────────────┐                                          │
│   │  edge  (Caddy)               /opt/edge     │  The only thing the internet can reach   │
│   │  ports 80 + 443, HTTPS certificates        │  (ports 80/443). Serves EVERY site on    │
│   │  sites/ckauth.caddy, sites/…other sites    │  this VPS, one file per site.            │
│   └───────────┬───────────────────────┬────────┘                                          │
│     /api/*    │ (prefix stripped)     │  everything else        "edge" network            │
│   ┌───────────▼──────────┐  ┌─────────▼──────────┐                                        │
│   │ ckauth-api (Express) │  │ ckauth-web (Caddy) │                    /opt/ckauth         │
│   │ :8080                │  │ :8080, the React   │                                        │
│   └───────────┬──────────┘  │ app's files        │                                        │
│               │             └────────────────────┘                                        │
│               │ "internal" network (CKAuth only)                                          │
│   ┌───────────▼──────────┐  ┌──────────────────────┐                                      │
│   │ db (Postgres 17)     │  │ redis (rate limits)  │  Not reachable from the internet       │
│   └──────────────────────┘  └──────────────────────┘  or from other sites.                  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### What happens on a request

1. The browser asks for `https://ckauth.chiragdev.com/sign-in`. The **edge** proxy handles HTTPS and passes the request to **ckauth-web**, which returns the React app.
2. The app calls `https://ckauth.chiragdev.com/api/auth/sign-in`. The edge strips `/api` and passes `/auth/sign-in` to **ckauth-api**.
3. The API checks the sign-in hasn't hit a rate limit (counts kept in **redis**), checks the password in **db**, and sets the session cookies.

Because the app and the API share **one address**, the session cookies just work: no CORS, no cross-site cookie problems.

### What happens on a deploy

```
 git push to main ─▶ GitHub Actions ─▶ build & check ─▶ Docker image ─▶ GHCR (image storage)
                                                                             │
                     VPS ◀── SSH: "pull image <sha>, migrate, restart" ◀─────┘
```

- **Two independent pipelines.** Changing `frontend/` deploys only the web app; changing the backend deploys only the API. One never restarts the other.
- **Every build is tagged with its git commit SHA** (a 40-character id like `8122a86…`). Rolling back means "run the image with the old SHA".
- **The VPS never builds code.** It only downloads ready images, and it holds no source code.

### Who logs in to the VPS

| User | Used by | Can |
|---|---|---|
| `chirag` | You | `sudo` (asks for your password), Docker |
| `deploy` | GitHub Actions only | Docker, `/opt/ckauth`, `/opt/edge`. **No `sudo`.** |
| `root` | Nobody | SSH login is turned off |

`/opt/ckauth` and `/opt/edge` belong to the **`deploy` group**, and `chirag` is a member. Both of you can edit the files there, and nobody else can read them.

---

## Part B: First-time setup

### Step 1: Collect what you need

**Accounts:**

- [ ] **Hostinger** VPS (KVM 2), with access to hPanel
- [ ] Access to the **DNS settings** for `chiragdev.com` (Hostinger, Cloudflare, or wherever you bought it)
- [ ] **GitHub**, with admin rights on `chiragdev1/ckauth`
- [ ] **Resend** (<https://resend.com>), for email
- [ ] **ImageKit** (<https://imagekit.io>), for profile pictures (optional; the app works without it)

**On your laptop:** `ssh` and `git`. On Linux and macOS they're already installed. Check with `ssh -V` and `git --version`.

**The code must be on GitHub.** The workflows only run from `main`, so first merge the branch that added deployment (`feat/deploy-and-frontend`). Don't merge until you reach [step 8](#step-8-first-deploy). Merging triggers a deploy, and the deploy needs steps 2–7 in place.

> 💡 **Keep notes as you go.** Open a password manager or a private note and record: the VPS IP, the `chirag` sudo password, and each secret you generate. You'll need them again.

---

### Step 2: Point the domain at the VPS

**What:** tell the internet that `ckauth.chiragdev.com` lives at your VPS's IP.
**Why:** browsers find your server through DNS, and the proxy can only get an HTTPS certificate once DNS points at it.

🌐 **browser**, in the DNS settings for `chiragdev.com` (on Hostinger: hPanel → Domains → `chiragdev.com` → DNS / Nameservers), **add a record**:

| Field | Value |
|---|---|
| Type | `A` |
| Name / Host | `ckauth` (just the part before `.chiragdev.com`) |
| Points to / Value | `203.0.113.10` (your VPS IP) |
| TTL | Leave the default (or 300 / 5 minutes) |

If your VPS also has an IPv6 address (hPanel → VPS → Overview), add a second record with **Type `AAAA`** and the IPv6 address.

> **On Cloudflare?** Set the record's proxy status to **DNS only** (grey cloud). The orange cloud stops Caddy from getting its certificate. You can turn it on later.

**✅ Check** 💻 laptop. DNS can take from a few minutes up to a couple of hours to spread. Repeat until you see your IP:

```bash
dig +short ckauth.chiragdev.com
# 203.0.113.10       ← must be your VPS IP
```

No `dig`? Use `nslookup ckauth.chiragdev.com`, or <https://dnschecker.org>. You can carry on with steps 3–7 while you wait.

---

### Step 3: Prepare the VPS and SSH access

**What:** secure the fresh server, install Docker, create your users, and set up passwordless SSH from your laptop.
**Why:** a new VPS lets root log in with a password, which is the first thing attackers try. After this step, only your key works.

Follow **[VPS-ACCESS.md, Part 1](VPS-ACCESS.md#part-1-ssh-from-your-laptop-to-the-vps)** (10–15 minutes). In short:

1. 💻 Create an SSH key on your laptop and 🌐 add it in hPanel.
2. 💻 Copy `deploy/setup-vps.sh` to the server and run it as root. It asks you to choose a password for `chirag`.
3. 💻 Test `ssh chirag@203.0.113.10` in a **new** terminal **before** closing the root one.
4. 💻 Add the `Host vps` shortcut, so from then on it's just `ssh vps`.

What the script does: installs Docker and git; creates `chirag` and `deploy`; creates `/opt/edge` and `/opt/ckauth`; opens only ports 22 (SSH), 80 and 443 in the firewall; enables automatic security updates and `fail2ban` (which blocks IPs that keep failing to log in); and turns off root and password logins.

> ⚠️ **Already running a website on this VPS** (nginx, Apache, another Caddy)? It holds ports 80/443, and the next step will fail. Stop it first (`sudo systemctl disable --now nginx`), and later move its sites into `/opt/edge/sites/` ([see Part C](#adding-another-site-to-the-vps)).

**✅ Check** 💻 laptop:

```bash
ssh -t vps 'id && docker --version && sudo ufw status | head -8'
# uid=…(chirag) … groups=…(sudo),…(docker),…(deploy)
# Docker version 2x.x.x …
# Status: active … 22/tcp (OpenSSH), 80/tcp, 443/tcp ALLOW
```

---

### Step 4: Start the shared web proxy

**What:** start **edge**, the Caddy container that owns ports 80/443 and gets HTTPS certificates for every site on this VPS.
**Why:** CKAuth's containers have no public ports. Everything reaches them through the edge proxy.

💻 laptop, from the repo folder. This copies the proxy's files and CKAuth's site file to the server:

```bash
scp deploy/edge/compose.yml deploy/edge/Caddyfile vps:/opt/edge/
scp deploy/ckauth.caddy vps:/opt/edge/sites/
```

🖥️ VPS (`ssh vps`):

```bash
cd /opt/edge
# optional: the address Let's Encrypt emails if a certificate is about to expire
# (default admin@chiragdev.com; use a real inbox, Let's Encrypt rejects example.com)
echo "ACME_EMAIL=<your real email>" > .env
docker compose up -d
docker compose logs -f caddy
```

Watch the logs for a line containing `certificate obtained successfully` for `ckauth.chiragdev.com`, then press **Ctrl+C** to stop watching. The container keeps running.

> If the logs show `NXDOMAIN`, `timeout during connect` or `no valid A records`, DNS isn't ready yet (step 2). Caddy keeps retrying on its own, so wait and check the logs again.

**✅ Check** 💻 laptop:

```bash
curl -sI https://ckauth.chiragdev.com | head -1
# HTTP/2 502        ← correct for now: HTTPS works, the app just isn't deployed yet
```

A **502** is a success here. A certificate error means DNS or ports 80/443 aren't right yet.

---

### Step 5: Set up email sending

**What:** let Resend send emails (verification, password reset, welcome) from an address on a domain you own.
**Why:** email providers reject mail from domains that haven't proven the sender is allowed. Resend proves it with DNS records.

> **The email domain is just a setting.** It lives in one line of `api.env` (`EMAIL_FROM`), and no domain is written into the code. You can start with a domain you've already verified (e.g. `dsaden.com`) and move to another later ([Part C: Changing the email domain](#changing-the-email-domain)).

**If your domain is already verified in Resend** (🌐 <https://resend.com/domains> shows it as **Verified**), skip to *API key* below.

**Verify a domain:**

1. 🌐 Resend → **Domains → Add domain**. Enter the domain, e.g. `chiragdev.com`. A subdomain such as `mail.chiragdev.com` keeps email reputation separate from your website, but either works.
2. Resend shows 3–4 DNS records (**MX**, **TXT** for SPF, **TXT** for DKIM, and often **TXT** for DMARC). 🌐 Add each one in your DNS settings, exactly as shown, the same way as in step 2.
3. 🌐 Back in Resend, click **Verify**. It can take a few minutes, up to a few hours.

**API key:** 🌐 Resend → **API Keys → Create API key**. Name it `ckauth-production` and give it **Sending access** only, restricted to your domain if offered. Copy the key (it starts with `re_`); Resend shows it only once.

**✅ Check:** the domain shows **Verified** in Resend, and you've saved the API key in your notes.

---

### Step 6: Create the settings files on the VPS

**What:** create the two files that hold CKAuth's settings and secrets on the server.
**Why:** secrets never go in git. They live only on the server, readable only by their owner.

| File | Read by | Holds |
|---|---|---|
| `/opt/ckauth/.env` | Docker Compose | The domain, database password, and which version is running |
| `/opt/ckauth/api.env` | The API | Session secrets, email and ImageKit keys |

**6a. Generate the secrets.** 🖥️ VPS. Run this three times, and save each output in your notes with its label:

```bash
openssl rand -hex 32      # → POSTGRES_PASSWORD
openssl rand -hex 64      # → ACCESS_TOKEN_SECRET_KEY
openssl rand -hex 64      # → REFRESH_TOKEN_SECRET_KEY   (must differ from the one above)
```

Use **new** values. Never reuse the ones from your laptop's `.env`.

**6b. Create `.env`.** 🖥️ VPS:

```bash
cd /opt/ckauth
nano .env
```

Paste this, and put your database password after `POSTGRES_PASSWORD=`:

```bash
DOMAIN=ckauth.chiragdev.com
POSTGRES_PASSWORD=<paste the 64-character value from 6a>
API_TAG=latest
WEB_TAG=latest
```

Save with **Ctrl+O, Enter**, and exit with **Ctrl+X**. Leave `API_TAG` and `WEB_TAG` as they are; deploys update them.

> ⚠️ **`POSTGRES_PASSWORD` is fixed after the first deploy.** Postgres stores it when the database is first created. Changing it later in `.env` alone breaks the connection ([how to change it](#rotating-secrets)).

**6c. Create `api.env`.** 💻 laptop: open `deploy/api.env.sample` in the repo. It explains every line. Then 🖥️ VPS:

```bash
nano api.env
```

Paste the sample's contents and fill in each empty value:

| Setting | Value |
|---|---|
| `ACCESS_TOKEN_SECRET_KEY` / `REFRESH_TOKEN_SECRET_KEY` | From 6a |
| `RESEND_API_KEY` | From step 5 |
| `EMAIL_FROM` | `CKAuth <no-reply@yourdomain.com>`, using your **Resend-verified** domain |
| `IMAGEKIT_PRIVATE_KEY` | From ImageKit → Developer → API keys, or leave empty to run without avatars |

**6d. Lock both files** so only the `deploy` group (you and GitHub Actions) can read them. 🖥️ VPS:

```bash
chmod 660 .env api.env
```

**✅ Check** 🖥️ VPS. Each command should print nothing:

```bash
cd /opt/ckauth
grep -E '^[A-Z_]+=$' .env api.env | grep -v IMAGEKIT     # lists any setting you left empty
ls -l .env api.env | grep -v -- '-rw-rw---- .* deploy'   # lists any file that isn't locked to the deploy group
```

---

### Step 7: Connect GitHub to the VPS

**What:** give GitHub Actions its own SSH key to the `deploy` user, and store everything it needs as encrypted GitHub secrets.
**Why:** this is how pushes to `main` become deploys, without your personal key or password ever leaving your laptop.

**7a. Create the deploy key.** Follow **[VPS-ACCESS.md, Part 3](VPS-ACCESS.md#part-3-github-actions--vps)**. You'll end up with a private key and a `known_hosts` line.

**7b. Create the `production` environment.** 🌐 GitHub → `chiragdev1/ckauth` → **Settings → Environments → New environment** → name it exactly `production` → **Configure environment**.

**7c. Add the secrets.** On that page, under **Environment secrets**, choose **Add secret** for each of these:

| Name | Value |
|---|---|
| `VPS_HOST` | `203.0.113.10` (your VPS IP) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Output of `cat ~/.ssh/ckauth_deploy`, **all** of it, including the `-----BEGIN…` and `-----END…` lines |
| `VPS_KNOWN_HOSTS` | The line from `ssh-keyscan -t ed25519 203.0.113.10` |

**7d. Add the variable.** Under **Environment variables**, choose **Add variable**:

| Name | Value |
|---|---|
| `DOMAIN` | `ckauth.chiragdev.com` |

**7e. Optional, recommended: approve each deploy.** Tick **Required reviewers** and add yourself. Every deploy then waits for you to click **Approve** in the Actions tab.

**✅ Check:** the `production` environment shows 4 secrets and 1 variable. 💻 laptop:

```bash
ssh -i ~/.ssh/ckauth_deploy deploy@203.0.113.10 'ls /opt/ckauth'
# api.env          ← the deploy user can log in and see the app folder
```

---

### Step 8: First deploy

**What:** merge the code to `main`, which triggers both pipelines for the first time.

1. 💻 laptop: push your branch, if you haven't already (`git push -u origin feat/deploy-and-frontend`).
2. 🌐 GitHub: open a **pull request** from `feat/deploy-and-frontend` to `main`. The **API** and **Web** checks run on it. Wait for both to go green, then click **Merge**.
3. 🌐 GitHub → **Actions**: two runs start, **API** and **Web**. Each goes through `check → image → deploy`. They deploy one at a time, in either order.
4. If you turned on required reviewers, click each run → **Review deployments** → **Approve**.

Each **deploy** job:

1. Copies `compose.yml`, `ckauth.caddy`, `deploy.sh` and `backup.sh` to `/opt/ckauth`.
2. Downloads the new image.
3. API only: starts Postgres and applies database migrations. On the first deploy this creates all the tables.
4. Starts the new container and waits until its health check passes.
5. Records the version in `.env`.
6. Validates and reloads the edge proxy.
7. Requests the site from outside, as a final check.

**✅ Check:** both runs are green. 🖥️ VPS:

```bash
cd /opt/ckauth && docker compose ps
# NAME           STATUS
# ckauth-api-1   Up … (healthy)
# ckauth-db-1    Up … (healthy)
# ckauth-web-1   Up … (healthy)
```

If a run fails, click the red step to read its log, then look up the message in [Part D](#part-d-troubleshooting).

---

### Step 9: Check everything works

🌐 **browser**: open `https://ckauth.chiragdev.com` and go through each flow with **your own email address**:

- [ ] The home page loads, and the padlock shows a valid certificate.
- [ ] **Sign up.** You see "Check your inbox", and an email arrives (check spam on the first run).
- [ ] **Verify.** The email link opens `/verify-email`, asks for your password, then sends you to sign in. The `?token=` disappears from the address bar.
- [ ] **Sign in.** You land on the dashboard with your name.
- [ ] **Upload a profile picture** (if ImageKit is configured).
- [ ] **Change password.** You stay signed in.
- [ ] **Sign out, then Forgot password.** The email arrives, the reset works, and you can sign in with the new password.
- [ ] **Reload the dashboard after 15+ minutes.** You're still signed in (the silent refresh works).

💻 laptop: check the security headers.

```bash
curl -sI https://ckauth.chiragdev.com | grep -iE 'strict-transport|content-security|x-frame|referrer'
# all four should be listed
```

For an outside opinion, run <https://securityheaders.com> and <https://www.ssllabs.com/ssltest/> on the address. Expect an **A** on both.

---

### Step 10: Turn on backups

**What:** dump the database every night, and keep copies somewhere other than the VPS.
**Why:** a backup that lives only on the server it protects is lost along with that server.

🖥️ VPS. First take one backup by hand, to make sure it works:

```bash
bash /opt/ckauth/backup.sh
# 2026-…  backup ok: /opt/ckauth/backups/ckauth-2026-10-21-0230.sql.gz (12K)
```

Schedule it for 02:30 every night. Run `crontab -e` (choose `nano` if asked), add this line at the bottom, then save and exit:

```
30 2 * * * bash /opt/ckauth/backup.sh >> /opt/ckauth/backups/backup.log 2>&1
```

It keeps 14 days of backups and deletes older ones.

**Copy backups off the server.** 💻 laptop. Run this now and then, for example weekly:

```bash
mkdir -p ~/ckauth-backups
scp 'vps:/opt/ckauth/backups/*.sql.gz' ~/ckauth-backups/
```

🌐 Also consider **hPanel → VPS → Backups / Snapshots** as an extra layer.

**✅ Check** 🖥️ VPS:

```bash
crontab -l | grep backup.sh      # the schedule is saved
```

The next morning, `tail /opt/ckauth/backups/backup.log` shows a new `backup ok` line.

🎉 **Setup is complete.** From now on, Part C covers everything you'll need.

---

## Part C: Everyday operations

All 🖥️ VPS commands assume you're logged in (`ssh vps`). Unless a command says otherwise, it runs in `cd /opt/ckauth`.

### Deploying a change

Push or merge to `main`. GitHub picks the pipeline from the files you changed:

| You changed | Runs | Restarts |
|---|---|---|
| `src/`, `drizzle/`, `Dockerfile`, root `package.json` or lockfile, `tsconfig.json` | **API** (with migrations) | `api` only |
| Anything in `frontend/` | **Web** | `web` only |
| `deploy/compose.yml`, `ckauth.caddy`, `deploy.sh` | **Both**, one after the other | Each its own |
| Docs only (`*.md`) | Nothing | Nothing |

Pull requests run the same build checks without deploying. Merge only when they're green.

**Watching a deploy:** 🌐 GitHub → **Actions**, then click the run. **Redeploying without a code change** (e.g. after a failed run): open the workflow (**API** or **Web**) → **Run workflow** → leave *tag* empty → **Run**.

### Rolling back

Use this when a deploy is live but broken.

1. 🌐 GitHub → **Actions** → the **API** or **Web** workflow → find the last good run → copy its full commit SHA (click the commit to see all 40 characters).
2. **Run workflow** → paste the SHA into **tag** → **Run**.

This skips the build and deploys the existing image for that SHA. Only that one service changes.

> ⚠️ **Rollbacks don't undo database migrations.** An older API has to work with the newer database. That's why migrations must stay backwards-compatible ([see below](#database-changes-migrations)).

> **Sessions (2 Nov 2026):** the API before the `sessions` table kept the session in `users.refresh_token`. Deploying the sessions release signs everyone out once, because the old tokens carry no session ID. Rolling back past it signs everyone out once more; nothing else breaks.

Then fix forward: revert or fix the bad commit on `main`, and the next push deploys it normally.

### Changing a setting

For example, a token expiry or the ImageKit key. 🖥️ VPS:

```bash
cd /opt/ckauth
nano api.env                   # make the change, save
docker compose up -d api       # recreates the api with the new settings
docker compose ps api          # wait for "(healthy)"
```

> ⚠️ **Use `up -d`, not `restart`.** `docker compose restart` reuses the old container with its **old** settings. `up -d` notices the change and recreates the container.

**Adding a brand-new setting** that new code needs: add it to `api.env` on the VPS **before** merging the code that uses it, and add it to `deploy/api.env.sample` in the same pull request.

### Changing the email domain

Use this when you move the sender from, say, `dsaden.com` to `chiragdev.com`. There are no code changes: the domain exists only in `EMAIL_FROM`.

1. 🌐 **Verify the new domain in Resend** first (see [step 5](#step-5-set-up-email-sending)). Wait until it shows **Verified**. If you switch before then, every email fails.
2. 🌐 **Check that the API key may use it.** If the key is restricted to one domain (Resend → API Keys → the key's *Domain*), create a new key for the new domain, or one for all domains.
3. 🖥️ **Change one line** in `/opt/ckauth/api.env`:
   ```bash
   EMAIL_FROM=CKAuth <no-reply@chiragdev.com>
   ```
   If you made a new key, update `RESEND_API_KEY` too.
4. 🖥️ **Apply it:** `docker compose up -d api`
5. ✅ **Test it:** use **Forgot password** with your own email on the live site. Then 🖥️ `docker compose logs --since 5m api | grep -i resend` should print nothing. A `not authorized to send emails from …` error means steps 1–2 aren't done.
6. Keep the old domain verified in Resend for a few days. Emails that are already in someone's inbox keep working either way.

**Locally:** do the same in your laptop's `.env`, then restart `pnpm dev`.

### Rotating secrets

Change a secret if it may have leaked, or as routine hygiene.

| Secret | How | Side effect |
|---|---|---|
| `ACCESS_TOKEN_SECRET_KEY` / `REFRESH_TOKEN_SECRET_KEY` | New value (`openssl rand -hex 64`) in `api.env` → `docker compose up -d api` | **Everyone is signed out** |
| `RESEND_API_KEY` | Create a new key in Resend → update `api.env` → `up -d api` → delete the old key in Resend | None |
| `IMAGEKIT_PRIVATE_KEY` | Same pattern | None |
| `POSTGRES_PASSWORD` | See below (two places must change together) | A few seconds of downtime |
| The GitHub deploy key | [VPS-ACCESS.md, Part 3](VPS-ACCESS.md#part-3-github-actions--vps) with a new key, update `VPS_SSH_KEY`, remove the old line from `/home/deploy/.ssh/authorized_keys` | None |

Changing `POSTGRES_PASSWORD` (🖥️ VPS):

```bash
NEW=$(openssl rand -hex 32)
docker compose exec db psql -U ckauth -c "ALTER USER ckauth PASSWORD '$NEW'"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW/" .env
docker compose up -d api
```

### Database changes (migrations)

Locally: edit `src/db/schema.ts` → `pnpm db:generate` → review the SQL in `drizzle/` → `pnpm db:migrate` → commit the migration folder along with the code. The API deploy applies it automatically, **before** the new API starts. If it fails, the old API keeps running.

Rules that keep rollbacks safe:

- **Add before you use.** Ship a new column (nullable or with a default) in one release, and start relying on it in the next.
- **Stop using before you remove.** Remove a column only after a release that no longer reads it.
- **Renames are an add plus a remove,** spread over two releases.

### Admins

Every account has a **role**: `user` (the default) or `admin`. Admins can open `/admin` on the site to search, invite and delete users (after confirming their password), and to read the **activity log** (sign-ins, wrong passwords, account changes and admin actions; see [`GET /admin/activity`](API.md#get-adminactivity)). On purpose, the website **can't** make anyone an admin, demote an admin or delete one. Those changes happen here, on the server, with the `manage-users` script that ships in the API image. Someone who steals an admin's session cookie still can't lock the real admins out, because that would take SSH access to the VPS.

**Become the first admin.** Sign up on the site and verify your email first. An unverified account can't sign in at all. Then, on the VPS, from any folder:

```bash
docker exec ckauth-api-1 node dist/scripts/manage-users.js role you@example.com admin
```

`docker exec` runs a command inside a container that is already running. The script runs inside the live API container, so it uses the production database and settings. `compose.yml` sets the project name to `ckauth`, so the API container is always called `ckauth-api-1` (check with `docker ps --filter name=ckauth-api`).

> **Which folder is which.** The running stack lives in `/opt/ckauth`, where each deploy copies `compose.yml`. `~/Authentication` is only a git clone of the code ([VPS-ACCESS.md](VPS-ACCESS.md#25-clone)). Don't run `docker compose …` for production inside `~/Authentication`: there it reads the repo's development `docker-compose.yml` instead. `docker exec ckauth-api-1 …` works from anywhere, and so does `cd /opt/ckauth && docker compose exec api …`.

Sign in again (or reload the page), and an **Admin** link appears in the account menu. The role is read from the database on every request, so the change takes effect at once.

**Other commands:**

```bash
docker exec ckauth-api-1 node dist/scripts/manage-users.js admins                       # list every admin
docker exec ckauth-api-1 node dist/scripts/manage-users.js role someone@example.com user  # demote an admin
docker exec ckauth-api-1 node dist/scripts/manage-users.js delete someone@example.com     # delete any account, admins included
```

Locally it's the same script: `pnpm build`, then `pnpm admin role you@example.com admin`.

`role` and `delete` are recorded in the activity log like any other change, as done "by the server", since the script has no signed-in admin.

### Performance measurements

A weekly GitHub workflow (`.github/workflows/perf.yml`, Mondays 03:30 UTC, or run it by hand from the Actions tab) loads the live home page and `/sign-in` in Chromium on a desktop profile and a phone on slow 4G, and times 20 `GET /api/` calls. It only reads: no sign-ins, no email. Nothing needs setting up on the VPS or in secrets.

Results go to an **orphan branch** (one with no shared history) called `perf-data`, created by the first run: `results.jsonl` holds one line per run, and `README.md` is the report with trend charts, which GitHub shows when you open the branch. Keeping them off `main` means the weekly commits never trigger a deploy. The same report appears in the run's summary.

GitHub **pauses scheduled workflows after 60 days with no commit to the repository** and emails you; re-enable it in the Actions tab. To measure from your own machine, run `pnpm perf` and `pnpm perf:report`.

### Logs and status

```bash
docker compose ps                                  # running? healthy? which version?
docker compose logs -f api                         # live API logs (Ctrl+C to stop)
docker compose logs --since 1h api                 # the last hour
docker compose logs -f web                         # web container
docker compose -f /opt/edge/compose.yml logs -f    # every request, every site, certificates
docker stats --no-stream                           # CPU and memory per container
df -h /                                            # disk space
grep -E '^(API|WEB)_TAG' .env                      # which commit each service is running
```

**Reading the API logs.** The API writes **[structured logs](GLOSSARY.md#logs-and-monitoring)**: one JSON object per line, with a `level` (`info`, `warn`, `error`), a fixed message (`msg`) and the details as fields. Every request gets one `request completed` line with its `route` (the route's template, e.g. `/auth/verify-email/:token`, never the real URL, which can hold one-time tokens), `status`, `ms`, `ip` and `userId`. Useful searches:

```bash
docker compose logs --since 1h api | grep '"level":"error"'          # failures, with their stack traces
docker compose logs --since 1h api | grep '"level":"warn"'           # rate limits hit, refused /admin requests
docker compose logs --since 1d api | grep '"msg":"mail failed"'      # every email that didn't send ("mail" says which)
docker compose logs --since 1d api | grep f9de846b-2052-4ccb         # one request, by the X-Request-Id a user quoted
```

**How much is logged** is set by `LOG_LEVEL` in `api.env`: `info` when it's not set (the default and the right choice for production), `debug` to also see routine lines such as the two `401`s every signed-out visit makes, or `warn` for less. Change it like any other setting (`docker compose up -d api`). Docker rotates each container's log at 3 × 10 MB (`daemon.json`, written by `setup-vps.sh`), so the oldest lines disappear on their own.

**Database shell:** `docker compose exec db psql -U ckauth`. Try `\dt` to list tables, `select email, email_verified from users;`, and `\q` to quit.

### Restoring a backup

> ⚠️ This **replaces** the current database with the backup's contents.

🖥️ VPS:

```bash
cd /opt/ckauth
bash backup.sh                                        # 1. back up the current state first, just in case
ls -lh backups/                                       # 2. choose the file to restore
docker compose stop api                               # 3. nobody writes while restoring
gunzip -c backups/ckauth-2026-10-21-0230.sql.gz | docker compose exec -T db psql -U ckauth -d ckauth
docker compose up -d api                              # 4. back online
```

To restore from your laptop's copy, first run `scp ~/ckauth-backups/<file> vps:/opt/ckauth/backups/`.

### Adding another site to the VPS

For example, a portfolio at `chiragdev.com`:

1. 🌐 **DNS:** an `A` record for that name pointing at `203.0.113.10`.
2. **Run the site as its own Compose project** (its own folder, e.g. `/opt/portfolio`). Put the public container on the shared network with a **unique** name, and publish **no** ports:
   ```yaml
   services:
     web:
       image: …
       networks:
         edge:
           aliases: [portfolio-web]
   networks:
     edge:
       external: true
   ```
3. 🖥️ **Add its site file** `/opt/edge/sites/portfolio.caddy`:
   ```
   chiragdev.com, www.chiragdev.com {
       reverse_proxy portfolio-web:80
   }
   ```
4. 🖥️ **Validate, then reload.** Always validate first: a broken file must never reach the proxy that serves every site.
   ```bash
   cd /opt/edge
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

### Resource budget: what's left for other sites

A Hostinger KVM 2 has **2 vCPUs, 8 GB RAM and 100 GB of NVMe disk**. Every CKAuth container has a hard memory cap and a CPU cap (`deploy.resources.limits` in `deploy/compose.yml`), so these numbers are ceilings, not hopes.

**Memory**

| Container | Cap | Typical use | Notes |
|---|---:|---:|---|
| `api` | 512 MB | 270–310 MB | Measured, idle to full load. Most of it is `drizzle-orm`'s import cost, not live data |
| `db` (Postgres) | 768 MB | ~100–200 MB | Grows with its cache as the user table grows |
| `redis` | 64 MB | < 10 MB | Rate-limit counters only; `maxmemory 48mb` inside |
| `web` | 64 MB | ~20 MB | Static files |
| **CKAuth total** | **~1.4 GB** | **~0.4–0.55 GB** | |
| `edge` (shared by every site) | 256 MB | ~30 MB | Counted once, not per site |
| Ubuntu + Docker | n/a | ~0.5 GB | |
| **Left for other sites** | **≥ 5.8 GB guaranteed** | **~7 GB in practice** | |

**CPU**

| Situation | CKAuth uses | Left for other sites |
|---|---|---|
| Idle | ~0% | ~2 vCPUs |
| 500 people online | ~0.4–0.5 vCPU | ~1.5 vCPUs |
| 2,000 people online | ~1.3 vCPU | ~0.7 vCPU |
| Password-guessing flood from many IPs | Up to the 1.5 vCPU API cap | ≥ 0.5 vCPU |

CPU caps are ceilings, not reservations: when CKAuth is quiet, other sites can use both vCPUs.

**Disk:** about 1–2 GB in total. That's the images (~0.8 GB), the database (a few MB per thousand users), 14 days of backups, and logs (capped at 30 MB per container). That leaves **~95 GB**.

**In short:** CKAuth needs about **¼ of the machine** in normal use, and at most **¾ of the CPU and under 1.5 GB of RAM** even when it's being hammered. A couple more small to medium sites (a portfolio, a static site, another small API with its own database) fit comfortably.

### Capacity: what CKAuth can handle

Measured on 2 dedicated cores, with the API capped like production. **Expect about 20–30% less on the real VPS**, because there Postgres shares the same cores, every connection goes through HTTPS, and vCPUs are shared with other customers.

| Load | Result |
|---|---|
| People online at once (each doing something every 2–6 s) | **2,000: p95 ~100 ms**. 1,000: p95 5 ms |
| Sign-ins per second (bcrypt bound) | ~40 (~30 with the 1.5 vCPU cap) |
| Profile loads (`/me`) per second | ~2,100 |
| One attacker guessing passwords | Blocked after 100 attempts in 15 min; real users unaffected (p95 46 ms) |
| A botnet using real account emails (rate limits can't stop it) | Real users slow to ~0.8 s until every targeted email has failed 5 times |

**If you outgrow this:** a botnet is the one case the app can't absorb on its own. Put Cloudflare in front, either as a proxy with a WAF or with Turnstile on the sign-in form. Beyond ~2,000 people online at once, move to a KVM 4 (4 vCPUs) and raise the API's CPU cap.

### Keeping the server up to date

- **Security updates** install automatically every day (`unattended-upgrades`).
- **Reboots:** some kernel updates need one. `cat /var/run/reboot-required` prints a message when that's the case. Reboot with `sudo reboot`; every container starts again by itself.
- **Postgres and Caddy images:** update them now and then.
  ```bash
  cd /opt/edge && docker compose pull && docker compose up -d
  cd /opt/ckauth && bash backup.sh && docker compose pull db && docker compose up -d db
  ```
  `postgres:17` only moves within version 17, which is safe. Moving to Postgres 18 is a separate, planned job: take a backup, then restore it into the new version.

---

## Part D: Troubleshooting

**Start here:** `docker compose ps` (is everything **healthy**?), then the logs of whatever isn't.

### In the browser

| Symptom | Cause | Fix |
|---|---|---|
| "Your connection is not private" | No certificate yet: DNS doesn't point here, or ports 80/443 are blocked | Step 2's check; `sudo ufw status`; the edge logs |
| `502 Bad Gateway` | The edge can't reach `ckauth-api`/`ckauth-web` | `docker compose ps` in `/opt/ckauth`; start or redeploy what's down |
| Blank page, errors in the browser console about "Content Security Policy" | The app is loading something from a domain the CSP doesn't allow | Add that domain to the `Content-Security-Policy` line in `deploy/ckauth.caddy` |
| Signed in, but bounced back to sign-in | The cookies were dropped: the site was opened over `http://` or at another hostname | Always use `https://ckauth.chiragdev.com` |
| An old version keeps showing after a deploy | The browser cached it | Hard refresh (Ctrl+Shift+R). `index.html` is never cached, so this clears itself |

### Email

| Symptom | Cause | Fix |
|---|---|---|
| No email; API logs show `not authorized to send emails from …` | `EMAIL_FROM`'s domain isn't verified, or the key can't use it | [Changing the email domain](#changing-the-email-domain), steps 1–2 |
| No email; logs show `API key is invalid` | Wrong or deleted `RESEND_API_KEY` | New key → `api.env` → `up -d api` |
| Email lands in spam | The domain is new, or DMARC is missing | Add Resend's DMARC record; the reputation improves over days |
| Email links open the wrong site | `DOMAIN` in `/opt/ckauth/.env` is wrong | Fix it → `docker compose up -d api` |

### Rate limits

| Symptom | Cause | Fix |
|---|---|---|
| A real user gets "Too many requests" | They (or someone guessing their password) hit a limit; see the table in [API.md](API.md#rate-limits) | Wait out the window (15 min for sign-in), or clear it now: `docker compose exec redis redis-cli --scan --pattern 'rl:signin-email:*'` lists the keys, then `redis-cli del <key>` |
| Everyone at one office/school gets 429 on sign-in | They share one public IP, and 100 sign-ins per 15 min is the per-IP limit | Raise `signinPerIp` in `src/app/middlewares/rate-limit.ts` |
| Limits seem to do nothing; API logs show `redis error` | Redis is down, and limits fail open on purpose so sign-in keeps working | `docker compose ps redis`; `docker compose up -d redis` |
| Every request appears to come from one IP | The API isn't seeing the real client address | It must be reached only through the edge proxy (it trusts exactly one proxy hop) |

### Deploys (GitHub Actions)

| Failing step / message | Cause | Fix |
|---|---|---|
| `Configure SSH` / `Upload` → `Permission denied (publickey)` | `VPS_SSH_KEY` is wrong or incomplete, or the public key isn't in `/home/deploy/.ssh/authorized_keys` | Redo [VPS-ACCESS Part 3](VPS-ACCESS.md#part-3-github-actions--vps); paste the **whole** private key |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` is wrong, or the VPS was reinstalled | Run `ssh-keyscan` again and update the secret |
| `docker login` → `denied` | The images belong to another account, or the job lacks `packages: read` | Image names must be `ghcr.io/chiragdev1/…` |
| `migrate` fails | A migration's SQL failed; the old API is still serving | Read the error in the log, fix the migration, push again |
| `--wait` → `container … is unhealthy` | The new version doesn't start | 🖥️ `docker compose logs api`; usually a missing setting in `api.env`. Roll back if needed |
| `network edge … could not be found` | The edge proxy isn't running | 🖥️ `cd /opt/edge && docker compose up -d` |
| `caddy validate` fails | A syntax error in `deploy/ckauth.caddy` | Fix it and push; the proxy kept its old, working config |
| Smoke test fails, everything else passed | The `DOMAIN` variable is missing or wrong in the `production` environment | Step 7d |
| The deploy job never starts | Required reviewers are on | Approve it in the run |

### On the server

| Symptom | Fix |
|---|---|
| `api` keeps restarting | `docker compose logs api`. Usually a missing `EMAIL_FROM`/`RESEND_API_KEY` or a wrong `POSTGRES_PASSWORD` |
| Disk full | `docker system df`, then `docker image prune -a` (removes images no container uses). Check `du -sh /opt/ckauth/backups` |
| Locked out of SSH | 🌐 hPanel → VPS → **Browser terminal**, which always works. See [VPS-ACCESS troubleshooting](VPS-ACCESS.md#troubleshooting) |

---

## Part E: Reference

### Files in the repo

| Path | What it is |
|---|---|
| `Dockerfile` | Builds the API image (non-root, production dependencies only) |
| `frontend/Dockerfile`, `frontend/Caddyfile` | Builds the web image: the React build served by Caddy on :8080. `/` is the prerendered home page; the app routes get the `app.html` shell with `X-Robots-Tag: noindex`; anything else is a real 404 |
| `deploy/compose.yml` | The CKAuth stack: `db`, `redis`, `migrate`, `api`, `web`, each with CPU/memory caps |
| `deploy/ckauth.caddy` | Public routing and security headers for `ckauth.chiragdev.com` |
| `deploy/deploy.sh` | Runs on the VPS during a deploy: `deploy.sh <api\|web> <sha>` |
| `deploy/backup.sh` | Nightly database dump with 14-day retention |
| `deploy/edge/` | The shared proxy (`compose.yml`, `Caddyfile`) |
| `deploy/env.sample`, `deploy/api.env.sample` | Templates for `/opt/ckauth/.env` and `api.env` |
| `deploy/setup-vps.sh` | One-time server preparation |
| `.github/workflows/api.yml`, `web.yml` | Build and deploy pipelines (by changed path) |
| `.github/workflows/deploy.yml` | The deploy job both pipelines share |
| `.github/workflows/perf.yml` | Weekly speed measurement of the live site (see "Performance measurements") |

### Files on the VPS

| Path | Created by | Notes |
|---|---|---|
| `/opt/edge/compose.yml`, `Caddyfile` | You (step 4) | Changes rarely |
| `/opt/edge/sites/ckauth.caddy` | Every CKAuth deploy | Don't edit it on the server; edit it in the repo |
| `/opt/ckauth/compose.yml`, `deploy.sh`, `backup.sh` | Every deploy | Don't edit them on the server; they're overwritten |
| `/opt/ckauth/.env`, `api.env` | You (step 6) | Secrets. `chmod 660`, `deploy` group only. Not in git |
| `/opt/ckauth/backups/` | `backup.sh` | 14 days of dumps |

### Ports

| Port | Open to | Used by |
|---|---|---|
| 22 | Internet | SSH (key only) |
| 80, 443 (TCP), 443 (UDP) | Internet | The edge proxy (HTTP → HTTPS redirect, HTTPS, HTTP/3) |
| 8080 | The `edge` Docker network only | `ckauth-api`, `ckauth-web` |
| 5432 | The `internal` Docker network only | Postgres |
| 6379 | The `internal` Docker network only | Redis (rate-limit counts; nothing stored on disk) |

### GitHub `production` environment

| Kind | Name | Value |
|---|---|---|
| Secret | `VPS_HOST` | VPS IP |
| Secret | `VPS_USER` | `deploy` |
| Secret | `VPS_SSH_KEY` | Private deploy key |
| Secret | `VPS_KNOWN_HOSTS` | `ssh-keyscan` line |
| Variable | `DOMAIN` | `ckauth.chiragdev.com` |
