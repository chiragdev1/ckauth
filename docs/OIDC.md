# Sign in with CKAuth (OpenID Connect)

> **Status: proposed, not built yet (6 Nov 2026).** This is the design for letting other websites and apps sign their users in through CKAuth. It's the first step of "CKAuth as a product for other apps" in the [DEVLOG](../DEVLOG.md)'s future scope. Nothing on this page exists in the code until this note changes. While the feature is new, it ships labelled **Beta** in production.

Today CKAuth signs people in to CKAuth itself. This feature turns it into an **identity provider**: a shop, clinic or community site sends its visitors to CKAuth to sign in, and CKAuth tells that site who they are. It uses **OpenID Connect (OIDC)**, the open standard behind "Sign in with Google", so any existing OIDC library works with CKAuth without a CKAuth-specific SDK.

Every technical term below is explained where it first appears and listed in the [glossary](GLOSSARY.md#sign-in-with-ckauth-openid-connect).

## Contents

- [Decisions so far](#decisions-so-far)
- [Part 1: the idea, without jargon](#part-1-the-idea-without-jargon)
- [Part 2: the same flow, technically](#part-2-the-same-flow-technically)
- [Tokens and their fields](#tokens-and-their-fields)
- [Endpoints](#endpoints)
- [What CKAuth stores](#what-ckauth-stores)
- [Security requirements](#security-requirements)
- [How this changes the existing code](#how-this-changes-the-existing-code)
- [Later, not in the first version](#later-not-in-the-first-version)
- [Open decisions](#open-decisions)
- [Keeping it secure and current](#keeping-it-secure-and-current)
- [Standards this follows](#standards-this-follows)

## Decisions so far

| Question | Decision | Why |
|---|---|---|
| Which protocol? | OpenID Connect, authorization-code flow with PKCE only | The industry standard. Every major identity provider supports it, and so does every client library |
| Who can register an app? | **Admins only, permanently**: CKAuth is a closed product with no self-service registration. In sudo mode, with an audit event | Registering an app grants it the power to receive users' data, so it's at least as hard as the other admin powers (see "Admins are made only out-of-band" in [CLAUDE.md](../CLAUDE.md)) |
| Do admin-registered apps get any shortcuts? | **No.** Every security and privacy rule applies to every app | Who registered an app says nothing about whether the app itself is safe, or whether a user wants to share with it. See [No exemptions](#no-exemptions-for-admin-registered-apps) |
| What user ID do apps see? | A **pairwise subject**: a different ID for each app (each *sector*, see below) | Two apps can't compare their user lists to work out that they share a person |
| How is it labelled? | **Beta**, in production too | It's a new product; the label sets expectations for developers who integrate it |
| Built by hand or on a library? | **By hand**, with `jose` for signing and key handling | To understand and own the protocol. The cost is that CKAuth must earn the assurance a certified library already has; [Keeping it secure and current](#keeping-it-secure-and-current) is how |

## Part 1: the idea, without jargon

Picture a **members' club** (a shop's website) that doesn't want to keep its own guest list. It trusts a **reception desk** in another building (CKAuth) to check who people are.

1. **The contract (once).** The club signs up with reception and says: "When you've checked a guest, send them back to *exactly this door*: 12 Shop Street, side entrance." Reception gives the club a **membership number** (anyone may know it) and a **secret password**, so reception knows when it's really the club calling.
2. **You arrive at the club.** The club doesn't let you in yet. It sends you to reception with three things:
   - a **ticket number** the club writes down, so it can recognise *you* when you come back;
   - a **one-time word** that reception must repeat back in its letter;
   - a **photo of half of a torn raffle ticket**. The club keeps the real half in its drawer.
3. **Reception checks the club first.** "Do I know this club? Is that *exactly* the door in the contract?" If not, reception warns you and doesn't send you anywhere, because a fake club could trick reception into sending you down a dark alley.
4. **Reception checks you.** You show your face and password (signing in). If reception saw you earlier today, it waves you through: one sign-in works for every club.
5. **Reception asks you.** "This club wants your name and email. Is that OK?" It remembers your answer for next time.
6. **The coat-check ticket.** Reception gives you a small ticket. It's valid for one minute, it works once and it's worthless on its own. You walk it back to the club.
7. **The private phone call.** The club checks that your ticket number matches its note. Then the manager phones reception on a private line you never hear: "Here's the coat-check ticket, here's the real half of the raffle ticket, and here's our secret password." If everything fits, reception hands over:
   - a **sealed, wax-stamped letter of introduction**: "This is guest #K7Q2, email confirmed, name Asha";
   - a **wristband** that's good for 15 minutes;
   - a **renewal voucher** for a fresh wristband later.
8. **The club checks the letter.** Is the wax seal really reception's? (Reception publishes a catalogue of its stamps, so anyone can compare.) Is the letter addressed to *this* club, from *that* reception, and still in date? Does it contain the one-time word? Only then does the club say "welcome in".
9. **Nicknames.** Reception calls you "#K7Q2" at this club and "#P3X9" at another, so two clubs can't compare guest lists.
10. **Renewals and goodbyes.** The voucher is swapped for a new wristband *and a new voucher*, and the old voucher is torn up. If anyone ever shows a torn-up voucher, reception knows it was copied and cancels everything. You can also tell reception at any time: "Stop vouching for me to that club."

## Part 2: the same flow, technically

### Who's who

| In the story | Technical term |
|---|---|
| The club | **Client**, also called the *relying party (RP)*: the app that relies on CKAuth to identify its users |
| Reception | **OpenID Provider (OP)**, or *authorization server*: CKAuth |
| You | The **end-user** |
| The contract | **Client registration**, done by a CKAuth admin |
| Membership number | **`client_id`**: public, appears in URLs |
| Secret password | **`client_secret`**: only for **confidential clients** (apps with a server). **Public clients** (single-page apps and mobile apps) can't keep a secret, so they rely on PKCE alone |
| "Exactly this door" | **`redirect_uri`**: where CKAuth sends the user back. Compared as an exact string, never as a prefix or pattern |
| Name and email request | **`scope`**: `openid email profile`. The `openid` scope is what makes the request OIDC rather than plain OAuth |
| "Is that OK?" | **Consent** |
| Ticket number | **`state`**: stops **CSRF** (cross-site request forgery). Without it, an attacker could make your browser finish *their* sign-in, so you'd end up using their account |
| One-time word | **`nonce`** ("number used once"): placed inside the ID token, so an old token can't be **replayed** (sent again later) |
| Torn raffle ticket | **PKCE** (Proof Key for Code Exchange, said "pixie"). The real half is the **`code_verifier`**, a random string. The photo is the **`code_challenge`** = `BASE64URL(SHA256(code_verifier))`. `code_challenge_method=S256` names that hash |
| Coat-check ticket | **Authorization code** |
| Walking between the buildings | **Front channel**: browser redirects, visible to anything on the user's device |
| Private phone call | **Back channel**: a direct server-to-server request to the token endpoint |
| Wax seal | A **digital signature** made with **ES256** (elliptic-curve) or **RS256** (RSA) |
| Stamp catalogue | **JWKS** (JSON Web Key Set): CKAuth's *public* keys, at `/.well-known/jwks.json` |
| Letter, wristband, voucher | **ID token**, **access token**, **refresh token** |
| Nicknames | **Pairwise subject identifier** |
| One sign-in for every club | **SSO** (single sign-on) |
| The dark alley | **Open redirect** |
| Torn-up voucher | **Refresh token rotation** and **reuse detection** |
| "Stop vouching" | **Revocation** and **logout** |

### The flow

```
 User's browser            shop.example (client)             ckauth.chiragdev.com (provider)
      │                           │                                    │
 0.   │                           │◄── admin registers the app ────────│  client_id, secret, redirect URIs
      │                           │                                    │
 1.   │── click "Sign in with CKAuth" ──►│                             │
      │◄── 302 to /authorize?client_id&redirect_uri&state&nonce&code_challenge
      │                                                                │
 2.   │──────────────────── GET /authorize ───────────────────────────►│ check client + redirect_uri FIRST
 3.   │◄─────────────── no CKAuth session? → /sign-in, then back ──────│ (the existing sign-in page)
 4.   │◄─────────────── consent: "Shop wants your name and email" ─────│
      │──────────────────── Allow ────────────────────────────────────►│ make a one-time code
 5.   │◄── 302 to shop.example/callback?code=…&state=…&iss=… ──────────│
      │                                                                │
 6.   │── GET /callback?code ───►│                                     │
      │                          │── POST /token (code + verifier + secret) ──►│  back channel
      │                          │◄── id_token + access_token (+ refresh_token)│
 7.   │                          │ verify the id_token with CKAuth's JWKS
      │◄── signed in to shop ────│ the shop starts its OWN session, keyed by `sub`
      │                          │
 8.   │                          │── GET /userinfo, POST /token (refresh) ────►│  later
 9.   │                          │── POST /revoke, or the user signs out ─────►│
```

**0. Registration.** An admin enters the app's name, its redirect URIs, whether it's confidential or public, and the scopes it may ask for. CKAuth returns a `client_id` and, for confidential clients, a `client_secret` that is shown once and stored only as a SHA-256 hash, like every other CKAuth token.

**1. The client starts.** The client generates `state`, `nonce` and a `code_verifier`, keeps them in its own session and redirects the browser:

```
https://ckauth.chiragdev.com/oauth/authorize
  ?response_type=code
  &client_id=shop_123
  &redirect_uri=https://shop.example/callback
  &scope=openid email profile
  &state=af0ifjsldkj
  &nonce=n-0S6_WzA2Mj
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

**2. CKAuth checks the client, in a fixed order.** First: is the `client_id` known? Second: is the `redirect_uri` exactly one of its registered URIs? If either check fails, CKAuth shows an error page and **never redirects**. Only once both pass does it report other problems (an unknown scope, a missing PKCE challenge) back to the client as `?error=…&state=…&iss=…`.

**3. The user signs in.** CKAuth reads its own session cookie, as `authenticateToken` does today. If there's none, it saves the pending request as a short-lived row and sends the user to `/sign-in?continue=<request id>`. The parameter is an ID, never a URL, so it can't become an open redirect. Unverified users can't continue, just as they can't sign in to CKAuth.

**4. Consent.** The page shows the app's name, its website's address and what it wants: "Shop (shop.example) wants your name and email address. Cancel / Allow." The answer is saved per user, app and set of scopes, so a returning user skips this screen unless the app asks for more.

The screen (`frontend/src/components/oauth-consent.tsx`, previewed at `/dev/oauth-consent`) follows these choices, made on 6 Nov 2026:

- **Cancel on the left, Allow on the right** when the buttons sit side by side. The forward action is on the right, as on most platforms' dialogs, and the page order is the visual order, so the Tab key reaches them in the order people see them. When the buttons are stacked (a long label such as "Continue as Asha Rao"), Allow goes on top.
- **"Cancel", not "Deny".** The person isn't judging the app. They're choosing not to go on, and "Deny" sounds like an accusation that makes people hesitate. Behind the button, the protocol still sends `error=access_denied` to the app.
- **A fixed scope order.** The rows are always name, email, "who you are", then "stay connected", whatever order the app asked in. That's data first and lasting access last, so two apps asking for the same thing look the same.
- **`openid` is listed only when no data scope is requested.** On its own it shares only the pairwise ID ("An ID only this app gets"). When `profile` or `email` is requested, those rows already say who the app learns about, and an extra row would only add noise.
- **An unknown scope throws.** The API sends only scopes the app is registered for (rule 20), so an unknown one is a bug. The screen fails with an error page rather than hiding a permission nobody can read.
- **The host is never truncated.** It wraps after a dot or a hyphen, so a look-alike name like `paypal.com.evil.example` can't be cut down to `paypal.com…` (rule 12).
- **Each row shows the person's own value** ("asha@example.com", not "your email address"), so they see exactly what the app will learn (rule 33).

**5. The authorization code.** CKAuth creates a random code that lasts 60 seconds and works once. It's stored hashed, together with the client, the redirect URI, the `code_challenge`, the `nonce`, the user and the scopes. CKAuth then redirects to `redirect_uri?code=…&state=…&iss=https://ckauth.chiragdev.com`. The `iss` parameter tells a client that uses several providers which one answered; this defends against **mix-up attacks**, where a malicious provider tricks a client into sending it another provider's code.

**6. The code exchange (back channel).** The client checks `state` and `iss`, then its server calls CKAuth directly:

```
POST /oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&redirect_uri=https://shop.example/callback&code_verifier=…
```

CKAuth:
- uses the code up with a conditional `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING`, so two parallel attempts can't both succeed;
- checks that `SHA256(code_verifier)` equals the stored challenge, that the client authenticated, and that `redirect_uri` is identical to the one in step 1;
- if a code is redeemed **a second time**, revokes every token issued from it, because reuse means the code was stolen.

**7. The client checks the ID token**, field by field (see [the ID token](#the-id-token)), and starts its own session.

**8. Later.** `GET /oauth/userinfo` with `Authorization: Bearer <access token>` returns fresh profile data. `grant_type=refresh_token` returns new tokens, and a new refresh token each time.

**9. Ending it.** The client calls `POST /oauth/revoke` to throw tokens away, or sends the user to the end-session endpoint to sign out of CKAuth too. The user can revoke any app from a "Connected apps" list on their dashboard. Deleting a CKAuth account revokes every app.

## Tokens and their fields

**JWT (JSON Web Token)** is the format of the ID and access tokens: three base64url parts joined by dots, `header.payload.signature`. Anyone can read the payload; the signature only proves nobody changed it, so a JWT never carries secrets.

| Token | Answers | Read by | Format | Lifetime |
|---|---|---|---|---|
| **ID token** | "Who is this person?" | the client | JWT, header `typ: JWT` | 5 minutes (it's used once, at sign-in) |
| **Access token** | "What may this caller do?" | `/userinfo` and APIs | JWT, header `typ: at+jwt` | 10 minutes |
| **Refresh token** | "May I have fresh tokens?" | CKAuth only | random string, stored hashed | 30 days at most; unused for 14 days → expires |

A **bearer token** is one that works for whoever holds it, like cash. Access tokens are bearer tokens, which is why they're short-lived.

### The ID token

```json
{
  "iss": "https://ckauth.chiragdev.com",
  "sub": "k7q2v9…",
  "aud": "shop_123",
  "exp": 1793836800,
  "iat": 1793836500,
  "auth_time": 1793830000,
  "nonce": "n-0S6_WzA2Mj",
  "email": "asha@example.com",
  "email_verified": true,
  "name": "Asha Rao"
}
```

| Field (a **claim**) | Means | The client must… |
|---|---|---|
| `iss` (issuer) | **Who made** the token | require exactly `https://ckauth.chiragdev.com` |
| `sub` (subject) | **Which user**: the pairwise ID for this app | key its accounts by `iss` + `sub`, never by email (emails change, `sub` never does) |
| `aud` (audience) | **Who it's for**: the client's `client_id` | reject it unless `aud` contains its own `client_id`. Skipping this lets app B accept a token CKAuth issued to app A |
| `exp` (expiry) | When it stops being valid, in Unix seconds | reject it afterwards (allowing at most a minute of clock difference) |
| `iat` (issued at) | When it was made | use it for sanity checks |
| `auth_time` | When the user last actually typed their password | use it if the app needs a recent sign-in |
| `nonce` | The client's one-time word | require it to equal the value saved in step 1 |
| `email`, `email_verified`, `name` | Profile data, only for the scopes the user allowed | treat it as profile data, not as the account's identity |

The client checks these **plus the signature**, using the key from the JWKS that matches the token's `kid` (key ID) header, and only with the algorithm CKAuth advertises.

### The access token

Built to [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068) (the standard JWT access-token format): `typ: at+jwt`, `iss`, `sub`, `aud` (the API it's meant for), `client_id`, `scope`, `exp`, `iat` and `jti` (a unique token ID). The different `typ` means an ID token can never pass as an access token, nor the other way round.

### Pairwise `sub`

Pairwise IDs are per **sector**: the host name shared by a client's redirect URIs. Two apps on the same host see the same `sub`; apps on different hosts see different ones. CKAuth stores one random value per (user, sector) in its own table, protected by a unique constraint, rather than deriving it with an HMAC. A derived ID would change for every user if its secret were ever replaced; a stored one survives key rotation, and it's deleted with the account. A new account created later with the same email gets a new `sub`, so it can't inherit the old account's data in other apps.

## Endpoints

All of them are listed in the **discovery document**, so a client library needs only the issuer URL.

| Endpoint | Purpose | Standard |
|---|---|---|
| `GET /.well-known/openid-configuration` | Discovery: every endpoint, algorithm and option below | OIDC Discovery |
| `GET /.well-known/jwks.json` | The public signing keys | RFC 7517 |
| `GET /oauth/authorize` | Starts the flow in the browser (front channel) | OIDC Core |
| `POST /oauth/token` | Exchanges a code or refresh token for tokens (back channel) | RFC 6749 |
| `GET /oauth/userinfo` | Profile claims for an access token | OIDC Core |
| `POST /oauth/revoke` | Revokes a refresh or access token | RFC 7009 |
| `GET /oauth/logout` | Ends the CKAuth session, then returns to a registered post-logout URI | OIDC RP-Initiated Logout |

Plus the CKAuth-side pages and API: the consent page (a new React route), the admin's app registration and "Connected apps" on the user's dashboard. All of these will be documented in [API.md](API.md) when they're built.

## What CKAuth stores

| Table | One row per | Holds |
|---|---|---|
| `oauth_clients` | registered app | name, type (confidential/public), hashed secret(s), redirect URIs, post-logout URIs, allowed scopes, allowed origins (for public clients), sector, **registered by** (the admin, for accountability), **status** (`active` / `disabled`: disabling revokes the app's tokens at once). No column that marks an app as trusted, first-party or exempt (see [No exemptions](#no-exemptions-for-admin-registered-apps)) |
| `oauth_requests` | pending authorize request | the validated request, a hash of a browser-binding cookie, expiry (10 minutes) |
| `oauth_codes` | authorization code | code hash, client, user, redirect URI, PKCE challenge, nonce, scopes, `auth_time`, expiry (60 s), used-at |
| `oauth_consents` | user + app | the scopes allowed, when |
| `oauth_refresh_tokens` | refresh token | token hash, family ID, client, user, scopes, absolute and idle expiry, used-at |
| `oauth_subjects` | user + sector | the pairwise `sub` |
| signing keys | key | public key and `kid` in the database; the **private key stays in the environment**, never in the database or logs |

## Security requirements

These are the rules the implementation must meet. They come from the current OAuth security best practice ([RFC 9700](https://www.rfc-editor.org/rfc/rfc9700), January 2025), OAuth 2.1, OIDC Core and the JWT best practice ([RFC 8725](https://www.rfc-editor.org/rfc/rfc8725)). Each rule names the attack it stops. Rules marked **(review)** were added on 6 Nov 2026, when the first draft of this design was checked against those standards.

### Flows

1. **Authorization code with PKCE only.** No implicit flow (tokens in the URL), no password grant (apps handling CKAuth passwords), no `response_mode=fragment`. *Stops: tokens leaking through URLs and browser history; apps phishing for passwords.*
2. **PKCE is required for every client, confidential ones too, and only `S256`.** `plain` is rejected, and so is a `code_verifier` shorter than 43 or longer than 128 characters. **(review)** *Stops: a stolen or injected code being redeemed.*
3. **No PKCE downgrade.** If the authorize request had no challenge, CKAuth rejects it outright. The token endpoint rejects a verifier when no challenge was stored, and a missing verifier when one was. **(review)** *Stops: an attacker stripping PKCE from the flow.*
4. **`iss` in every authorization response**, advertised as `authorization_response_iss_parameter_supported: true` ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)). **(review)** *Stops: mix-up attacks.*

### Clients and redirect URIs

5. **The redirect URI is checked before anything else**, and on failure CKAuth shows an error page and never redirects. *Stops: open redirects.*
6. **Exact string match**, both at `/authorize` and again at `/token`. No wildcards, prefixes or patterns. *Stops: codes being sent to a look-alike URL.*
7. **Rules when an admin registers a URI:** `https://` only; no fragment (`#…`) and no user name or password in the URL. Native apps may use `http://127.0.0.1` with any port, or a private-use scheme in reverse-domain form (`com.example.app:/callback`), as [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) describes. All of a client's redirect URIs share one host, which becomes its pairwise sector. **(review)** *Stops: codes travelling over plain HTTP; ambiguous sectors.*
8. **Client secrets:** 32 random bytes, shown once, stored as SHA-256, compared with `crypto.timingSafeEqual`. Two secrets can be active at once during a rotation. **(review)** *Stops: secrets leaking from the database; timing attacks.*

### Browser side

9. **Consent cannot be clickjacked:** the consent page is never shown inside a frame. CKAuth already sends `frame-ancestors 'none'` and `X-Frame-Options: DENY` from `deploy/ckauth.caddy`. *Stops: a site hiding the Allow button under its own.*
10. **The pending request is bound to the browser that started it**, by a random cookie whose hash is stored in its `oauth_requests` row. It expires after 10 minutes and works once. **(review)** *Stops: an attacker making a victim approve a request the attacker started.*
11. **"Allow" is a `POST` through `api.ts`,** which returns `{redirectTo}`; the page then sets `window.location` itself. Browsers apply CSP `form-action 'self'` to the redirect after a form submission, so a plain HTML form would be blocked. The session cookie is `SameSite=Lax`, so a cross-site `POST` never carries it: that blocks CSRF on Allow. The cross-site `GET /oauth/authorize` *does* carry it, which is what lets single sign-on work. **(review)** *Stops: CSRF on consent.*
12. **The consent screen shows the app's host** (`shop.example`) next to its name, and the Beta label. *Stops: a registered app named after a better-known one fooling users.*
13. **`Referrer-Policy: no-referrer`** stays on CKAuth's pages (it's already set). The developer docs tell clients to set it on their callback page too, since the code is in its URL. *Stops: the code leaking through the `Referer` header.*

### Tokens and keys

14. **One signing algorithm per key, always pinned.** OIDC tokens are signed with **ES256** (or RS256 with 2048-bit keys or more). Every verifier names the algorithms it accepts, `none` is always rejected, and the `jku`, `x5u` and `jwk` headers (which tell a verifier to fetch or use a key named inside the token) are ignored. The existing session JWTs (HS256) and the new OIDC tokens use separate keys, separate `typ` and `aud`, and separate verification functions. **(review)** *Stops: **algorithm confusion**, where an attacker signs an HS256 token using the public RS256/ES256 key as the "secret", and tokens of one kind being accepted as the other.*
15. **Key rotation:** each key has a `kid`. A new key is published in the JWKS before it's used, and the old one stays there until every token it signed has expired. The JWKS response is cacheable for a few minutes. **(review)**
16. **`Cache-Control: no-store`** on every token and userinfo response, as RFC 6749 requires. **(review)** *Stops: tokens left in caches and proxies.*
17. **Refresh tokens** are issued only when the client asks for `offline_access` and the user allows it (OIDC Core 11). They rotate on every use; reusing an old one revokes its whole family. They have a 30-day absolute lifetime and a 14-day idle lifetime. **(review)** *Stops: a stolen refresh token working forever.*
18. **Everything is revoked together when the account's security changes.** A password reset, password change or account deletion deletes the user's refresh tokens and consents in the same transaction that deletes their sessions today (`tx.delete(sessionsTable)` in the controller). **(review)** *Stops: an attacker who stole access keeping it through a password reset.*
19. **`/userinfo` checks the database on every call** (the grant still exists, the user is still verified), as `authenticateToken` does. An access token therefore stops working as soon as it's revoked, not only when it expires. **(review)**
20. **Scopes are limited** to the client's allowed scopes, and to what the user consented to. Claims appear only for granted scopes; a refresh can narrow scopes, never widen them.
21. **Never issue tokens to unverified users**, so `email_verified` is always `true`.

### Prompts and sessions

22. **`prompt` and `max_age` are honoured** (OIDC Core 3.1.2.1). `prompt=none` never shows a page: it answers `login_required` or `consent_required`. `prompt=login` and an expired `max_age` make the user type their password again. `prompt=consent` shows consent even if it was given before. **(review)**

### Operations

23. **Rate limits** with the existing limiter: `/oauth/authorize` per IP, `/oauth/token` per client and per IP, `/oauth/revoke` and `/oauth/userinfo` per client. The table in [API.md](API.md) gets them.
24. **Audit events** in the same transaction as the change: app registered, secret rotated, app disabled, consent granted, consent revoked, refresh-token reuse detected. Tokens, codes and secrets are never logged. `/oauth/authorize` is logged by its route template, never with its query string.
25. **CORS for public clients:** a single-page app on its own domain needs CORS on `/oauth/token`, `/oauth/userinfo` and `/oauth/revoke`, allowed only for the origins registered for that client. Discovery and the JWKS allow any origin. Today CKAuth has no CORS at all ([known limitations](../README.md#known-limitations)). **(review)**
26. **Prove it with the OpenID conformance suite.** The OpenID Foundation's free test suite runs hundreds of checks against a live provider, and passing its "Basic OP" profile is how providers show they meet the standard. Run it against a local server before the first release, and again after any change to these endpoints. **(review)**

### No exemptions for admin-registered apps

Every app is registered by an admin, and that is the *only* thing an admin controls. An admin decides which apps exist; only each user decides what an app learns about them. In the code, every client is treated as untrusted.

27. **No trusted, first-party or skip-consent flag exists**, in the schema or in the code. There is no setting that lets an app skip consent, PKCE, the exact redirect match, scope limits or pairwise IDs. `scripts/check-repo.js` fails if one appears. *Stops: one "temporary" exemption becoming a permanent hole.*
28. **Admins can't consent for a user, sign in as a user to an app, or issue tokens by hand.** Tokens come only from a user's own sign-in and consent.
29. **Widening an app's scopes needs every user's consent again.** An admin may add a scope to an app, but existing consents cover only the old scopes, so users see the consent screen again on their next sign-in.
30. **Admins see apps, not people's use of them.** The admin pages show an app's settings and how many users it has; which users, and when they signed in, appear only in the audit log, which already hides IPs. A user's own "Connected apps" list is theirs alone.
31. **Secrets are write-only.** A client secret is shown once at creation or rotation; no admin page or API returns it again.
32. **Every admin change to an app** (register, edit redirect URIs or scopes, rotate the secret, disable) needs sudo mode and records an audit event in the same transaction. An admin can't delete the audit trail of their own changes.
33. **Each app is named in the Privacy Policy's list of places data may go,** and is visible to every user it receives data about (consent screen, "Connected apps"). Registering an app updates the policy in the same change.

## How this changes the existing code

- **Signing keys.** A new private key in the environment (`OIDC_SIGNING_KEY`, a PEM file's contents) goes in `deploy/api.env.sample` and [DEPLOYMENT.md](DEPLOYMENT.md), and onto the VPS before the deploy that needs it.
- **Routing.** Caddy sends `/api/*` to the API and everything else to the web container, so `/.well-known/*` and `/oauth/*` need their own rule in `deploy/ckauth.caddy` that sends them to the API. The consent page is a new React route, which also goes in the `@app` list in `frontend/Caddyfile`.
- **Pinning today's algorithm.** The existing `jwt.verify(token, secret)` calls (`middleware.ts`, `jwt-token.ts`) don't name an algorithm. That's safe today, because `jsonwebtoken` 9 accepts only HS algorithms when the key is a string. Pin `{algorithms: ['HS256']}` anyway, before any public key exists in the app.
- **Sign-in.** `/sign-in` gains `?continue=<request id>` to resume a pending authorize request.
- **Password and account changes.** The places that delete sessions also delete OIDC refresh tokens and consents (rule 18).
- **Privacy Policy and Terms.** CKAuth starts sharing data with apps the user approves: the policy must say what, with whom, and how to revoke it, in the same change.
- **Beta label.** Shown in production on the consent screen, the admin's app pages and the developer docs, designed through `/ui-change`.

## Later, not in the first version

| Feature | What it adds | When |
|---|---|---|
| **PAR** (Pushed Authorization Requests, [RFC 9126](https://www.rfc-editor.org/rfc/rfc9126)) | The client sends the authorize parameters over the back channel first, so nothing can tamper with them in the browser | When a high-security client needs it |
| **DPoP** ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449)) | Ties tokens to a key the client holds, so a stolen token is useless on its own | Good next step for public clients |
| **`private_key_jwt`** | Clients prove who they are with a signed JWT instead of a shared secret | With PAR or DPoP |
| **Back-Channel Logout** | CKAuth tells apps directly when a user signs out | When apps ask for it |
| **Token introspection** ([RFC 7662](https://www.rfc-editor.org/rfc/rfc7662)) | APIs ask CKAuth whether a token is still valid | When third-party APIs accept CKAuth tokens |
| **FAPI 2.0** | The OpenID Foundation's profile for banking-grade security (PAR + DPoP or mTLS) | Only if CKAuth targets that market |

## Open decisions

- **Access-token audience.** Until third-party APIs accept CKAuth tokens, the only API is `/oauth/userinfo`, so `aud` is CKAuth's own issuer URL.

## Keeping it secure and current

CKAuth's provider is written by hand. [`oidc-provider`](https://github.com/panva/node-oidc-provider), the certified Node.js library, has had about ten years of users, bug reports and certification runs; CKAuth starts with none. CKAuth also implements far less: one flow, admin-registered clients only, no dynamic registration, no request objects. A smaller surface means fewer places to get wrong, and only admins can add clients, so no hostile app can register itself. That narrows who can add an app, but not what an app may do: the [no-exemptions rules](#no-exemptions-for-admin-registered-apps) still treat every app as untrusted. The gap is in **unknown unknowns**: edge cases nobody on the project has met yet. These habits close it.

**Before the first release**
- **A test for every rule** in [Security requirements](#security-requirements), each proved by breaking the code once and watching it fail. The *negative* tests matter most: repeated parameters, a wrong `redirect_uri` by one character, a reused code, a reused refresh token, a downgraded PKCE request, an HS256 token signed with the public key.
- **The OpenID conformance suite**, "Basic OP" profile, passing with no failures or warnings left unexplained.
- **A check in `scripts/check-repo.js` for each rule that code can enforce**, for example: every JWT verify call names its algorithms.
- **An OWASP ASVS pass**: the *Application Security Verification Standard* (version 5) has a chapter on OAuth and OIDC, a checklist written by people who review providers for a living.
- **A `SECURITY.md`** saying how to report a vulnerability privately (GitHub's private vulnerability reporting), so researchers have a way in.

**Ongoing**
- **Use `oidc-provider` as a canary.** Watch its releases and security advisories on GitHub (Watch → Custom → Releases and Security alerts). When it fixes a security bug, check whether CKAuth has the same one. The same goes for `jose`, which Dependabot also tracks.
- **Follow the standards bodies.** Watch the IETF OAuth working group's document list (datatracker.ietf.org/wg/oauth) and the OpenID Foundation's specification announcements. The two to watch now are the OAuth 2.1 draft becoming an RFC, and any update to RFC 9700.
- **Re-run the conformance suite** after every change to `/oauth/*` or `/.well-known/*`, and before every release that touches them; later, in CI.
- **Review this page every quarter** against the latest RFC 9700, OAuth 2.1 and ASVS. Update the date below and record what changed in the [DEVLOG](../DEVLOG.md).
- **When the Beta ends**, consider an outside review: an independent security review, or formal OpenID certification (the suite is free; certification has a fee).

**Last reviewed against the standards:** 6 Nov 2026 (RFC 9700, OAuth 2.1 draft, OIDC Core 1.0, RFC 8725, RFC 9207).

## Standards this follows

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html), [Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), [RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) OAuth 2.0, and the [OAuth 2.1 draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) that folds in later best practice
- [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) PKCE · [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) OAuth security best current practice · [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207) issuer in the authorization response
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519) JWT · [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725) JWT best practice · [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068) JWT access tokens · [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517) JWK
- [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) token revocation · [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) OAuth for native apps
