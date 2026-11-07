# API Reference

Everything a client needs in order to use the Authentication API. New to some of the terms (endpoint, status code, `httpOnly` cookie, refresh token)? They're defined in the [glossary](GLOSSARY.md).

- **Base URL (production):** `https://ckauth.chiragdev.com/api`. The proxy strips `/api`, so `POST https://ckauth.chiragdev.com/api/auth/sign-in` reaches `POST /auth/sign-in`.
- **Base URL (local):** `http://localhost:8080`, or `http://localhost:3000/api` through the frontend's dev proxy.
- **Endpoints** are under `/auth`, and the [admin endpoints](#admin-endpoints) under `/admin`.
- **Request bodies** are JSON (`Content-Type: application/json`), except avatar upload, which is `multipart/form-data`.

---

## Contents

- [Basics](#basics): response format, authentication, errors
- [Frontend pages the emails link to](#frontend-pages-the-emails-link-to)
- **Endpoints**
  - [Sign up](#post-authsign-up) · [Verify email](#post-authverify-emailtoken) · [Sign in](#post-authsign-in) · [Refresh](#post-authrefresh) · [Log out](#post-authlogout)
  - [Resend verification email](#post-authresend-verification)
  - [Get current user](#get-authme) · [Edit profile](#patch-authme) · [Change email](#post-authchange-email) · [Confirm new email](#post-authconfirm-emailtoken) · [Upload avatar](#post-authupload-avatar) · [Remove avatar](#delete-authavatar) · [Delete account](#delete-authme)
  - [List devices](#get-authsessions) · [Sign out a device](#delete-authsessionsid) · [Sign out other devices](#delete-authsessions)
  - [Forgot password](#post-authforgot-password) · [Reset password](#post-authreset-passwordtoken) · [Change password](#post-authchange-password)
- [Metrics](#post-metricsvisit): count a visit from a tagged link
- [Admin endpoints](#admin-endpoints): [stats](#get-adminstats) · [list users](#get-adminusers) · [activity log](#get-adminactivity) · [confirm password](#post-adminreauth) · [invite user](#post-adminusers) · [delete user](#delete-adminusersid)
- [Typical flows](#typical-flows)

---

## Basics

### Response format

Every response has the same shape.

**Success**

```json
{
  "success": true,
  "message": "User signed in successfully",
  "data": { "id": "7a95b874-5c81-4cf8-8c88-33f6015c7aa5" }
}
```

`data` is `null` when there is nothing to return.

**Error**

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

A few errors also carry a **`code`**, a stable name for the reason that a client can act on without reading the message (messages are written for people and may change). Today there is one: `REAUTH_REQUIRED` (see [`POST /admin/reauth`](#post-adminreauth)).

```json
{ "success": false, "message": "Confirm your password to continue", "code": "REAUTH_REQUIRED" }
```

### Request IDs

Every response, success or error, carries an **`X-Request-Id`** header: a random UUID (a 36-character unique identifier) for that one request. The API's logs and the [activity log](#get-adminactivity) record the same ID, so quoting it when reporting a problem finds exactly that request's [log lines](GLOSSARY.md#logs-and-monitoring). The API always makes its own; one sent by a client is ignored.

```
X-Request-Id: f9de846b-2052-4ccb-9665-c5a63edc764e
```

### Authentication

Sessions use two **`httpOnly` cookies** that the API sets on sign-in and on email verification. Your code never reads, stores or sends tokens by hand.

| Cookie | Purpose | Lifetime |
|---|---|---|
| `access_token` | Proves who the user is on every request | Short (`ACCESS_TOKEN_EXPIRY`, e.g. 15 min) |
| `refresh_token` | Gets a new access token when the old one expires | Longer (`REFRESH_TOKEN_EXPIRY`, e.g. 1 day) |

What this means for a browser client:

- Send cookies with every request: `fetch(url, { credentials: 'include' })`, or `axios` with `withCredentials: true`.
- When a protected endpoint returns **`401`**, call [`POST /auth/refresh`](#post-authrefresh) once, then retry the original request. If refresh also fails, send the user to sign in.
- **In production, the frontend and API must be on the same site.** The cookies are `SameSite=Lax`, so browsers won't send them from a different site. CKAuth uses one origin (`ckauth.chiragdev.com` + `/api`), so no CORS is involved. Locally, `localhost:3000` → `localhost:8080` works, because ports don't count as different sites.
- **Every device has its own session.** Signing in on a phone doesn't sign out the laptop. A user can have up to **10** sessions; an 11th sign-in ends the one used least recently. [`GET /auth/sessions`](#get-authsessions) lists them.
- **"Signed out" takes effect at once.** Each access token names its session, and every protected request checks that the session still exists. When a session ends (logout, signing out a device, a password reset or change, a deleted account), both of its tokens stop working on the next request.

Endpoints marked **🔒 Auth required** need a valid `access_token` cookie, and the user's email must be verified.

### Validation errors

Invalid input returns **`400`** with every problem listed in the message, as `field: problem`:

```json
{
  "success": false,
  "message": "Invalid input fields: email: Invalid email address, password: Too small: expected string to have >=6 characters"
}
```

### Common errors

| Status | Meaning |
|---|---|
| `400` | Invalid input (see above). |
| `401` | Not signed in, the session has expired, or the credentials are wrong. |
| `403` | Signed in correctly, but the email isn't verified yet, or (on `/admin` endpoints) the user isn't an admin. |
| `404` | The link or token is invalid or has expired. |
| `429` | Too many attempts. See [Rate limits](#rate-limits). |
| `500` | Server error. Usually `Internal Server Error`, sometimes a more specific message (e.g. `Could not save refresh token in db`). Safe to retry. |

> **Known issue:** a JSON body that is malformed or larger than 50 KB currently returns `500` instead of `400`/`413`.

### Rate limits

Endpoints that check a password, send an email or use a single-use token are rate limited. Over the limit, the API returns **`429`**:

```json
{ "success": false, "message": "Too many requests, please try again later" }
```

Every response from a limited endpoint carries the standard `RateLimit-Policy` and `RateLimit` headers (IETF draft 8). They say how many requests are left and when the window resets, so a UI can show "try again in N minutes".

| Endpoint | Limit | Counted per |
|---|---|---|
| `POST /auth/sign-in` | 100 per 15 min | IP address |
| `POST /auth/sign-in` | 5 **failed** attempts per 15 min | Email address. Successful sign-ins don't count; any failure does (`401` wrong password, `403` unverified). |
| `POST /auth/sign-up` | 10 per hour | IP address |
| `POST /auth/sign-up` | 5 per hour | Email address. Stops one inbox being flooded from many IPs. |
| `POST /auth/resend-verification` | 10 per hour | IP address |
| `POST /auth/resend-verification` | 3 per hour | Email address |
| `POST /auth/forgot-password` | 10 per hour | IP address |
| `POST /auth/forgot-password` | 3 per hour | Email address |
| `POST /auth/verify-email/:token` | 20 per 15 min | IP address |
| `POST /auth/reset-password/:token` | 20 per 15 min | IP address |
| `POST /auth/refresh` | 60 per minute | IP address |
| `POST /auth/change-password` | 5 per 15 min | Signed-in user |
| `POST /auth/upload-avatar` and `DELETE /auth/avatar` | 10 per hour, shared | Signed-in user |
| `DELETE /auth/me` | 5 **wrong passwords** per 15 min | Signed-in user |
| `POST /auth/change-email` | 5 per hour, right password or not | Signed-in user |
| `POST /auth/confirm-email/:token` | 20 per 15 min | IP address |
| `POST /admin/users` and `DELETE /admin/users/:id` | 30 per 15 min, shared | Signed-in admin |
| `POST /admin/reauth` | 5 **wrong passwords** per 15 min | Signed-in admin |
| `POST /metrics/visit` | 30 per hour | IP address. A real visitor posts once per tab; this only stops a script inflating the counts. |

- **The per-email limits apply whether or not the account exists,** with the same `429`, so they can't be used to find out who's registered.
- **While an email is limited, even the right password gets `429`.** Show "too many attempts, try again later" rather than "wrong password".
- IPv6 addresses are grouped by `/56` subnet, because one user usually controls a whole block of them.

---

## Frontend pages the emails link to

The API sends emails with links to **your frontend** (`FRONTEND_URL`), not to the API. Your frontend needs these pages:

| Page | Linked from | What it should do |
|---|---|---|
| `/verify-email?token=…` | Verification email | Ask for the user's password, then call [Verify email](#post-authverify-emailtoken). |
| `/reset-password?token=…` | Password reset email | Ask for a new password, then call [Reset password](#post-authreset-passwordtoken). |
| `/sign-in` | "Account already exists" email | Your sign-in page. |
| `/forgot-password` | "Account already exists", "new sign-in" and "email change requested" emails | Your forgot-password page. |
| `/confirm-email?token=…` | "Confirm your new email" email | Show a button that calls [Confirm new email](#post-authconfirm-emailtoken). Don't call it on page load: mail scanners open links to check them. |
| `/dashboard#devices` | "New sign-in" email | The device list, where the user can sign the new device out. |

---

## Endpoints

### `POST /auth/sign-up`

Creates an account and sends a verification email.

**Body**

| Field | Type | Rules |
|---|---|---|
| `firstName` | string | Required, 2–45 characters |
| `lastName` | string \| null | Optional, up to 45 characters |
| `age` | integer | Optional, positive |
| `email` | string | Required, valid email. Spaces are trimmed and it's stored in lowercase. |
| `password` | string | Required, 6–72 characters |
| `ref` | any | Optional. The `?ref=` tag of the link the visitor arrived through (see [Count a visit](#post-metricsvisit)). A known tag is stored on a new account as its sign-up source; anything else is ignored and never fails the sign-up. A repeat sign-up keeps the first account's source. |

```json
{ "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com", "password": "s3cret-pass" }
```

**Response: `201`**

```json
{ "success": true, "message": "Check your email to finish creating your account", "data": null }
```

> **The response is the same whether or not the email is already registered.** This stops anyone using sign-up to find out who has an account. The difference is explained by email instead: new users get a verification link, and existing users get a note telling them how to sign in.
> **Frontend:** after sign-up, always show a "check your inbox" screen.

**Errors:** `400` for invalid input.

---

### `POST /auth/verify-email/:token`

Verifies the user's email. `:token` comes from the `?token=` in the verification link.

**Body**

| Field | Type | Rules |
|---|---|---|
| `password` | string | Required. The password chosen at sign-up. |

```json
{ "password": "s3cret-pass" }
```

**Response: `200`**

```json
{ "success": true, "message": "Email verified successfully", "data": { "id": "7a95b874-5c81-4cf8-8c88-33f6015c7aa5" } }
```

**The user is now signed in:** the response sets the `access_token` and `refresh_token` cookies, exactly like [Sign in](#post-authsign-in), so send them straight to the app. Any session started before verifying is ended. A welcome email is sent.

**Errors**

| Status | Message | What to show |
|---|---|---|
| `400` | `Invalid input fields: …` | The password is missing. |
| `401` | `Incorrect password, this verification link has been cancelled. Sign up again or sign in to get a new link` | **The link no longer works.** Send the user to sign up or sign in, which emails them a new link. |
| `404` | `Invalid or expired email token` | The link has expired or was already used. Signing in sends a new one. |

> **Why ask for the password?** It proves that the person who owns the inbox is also the person who signed up. This stops someone registering *your* email with *their* password and getting it verified.

---

### `POST /auth/sign-in`

Signs the user in and sets the session cookies.

**Body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required |
| `password` | string | Required, at least 6 characters |

**Response: `200`** (sets the `access_token` and `refresh_token` cookies)

```json
{ "success": true, "message": "User signed in successfully", "data": { "id": "7a95b874-…" } }
```

**Errors**

| Status | Message | What to show |
|---|---|---|
| `400` | `Invalid input fields: …` | Fix the form. |
| `401` | `Invalid email or password` | Same message for an unknown email or a wrong password. |
| `403` | `Please verify your email before signing in, check your inbox for the verification link` | The email isn't verified. If the last link had expired, a new one has just been sent. Offer [Resend verification email](#post-authresend-verification) too. |

> **New-device email.** When the browser signing in has no other live session on this account (judged by its user agent), the owner is emailed "New sign-in to your account", naming the browser and IP with a link to the device list. Signing in again on the same browser sends nothing.

---

### `POST /auth/refresh`

Gets a new access token using the `refresh_token` cookie. **Both cookies are replaced**, and the old refresh token stops working.

**Body:** none.

**Response: `200`** (sets new cookies)

```json
{ "success": true, "message": "Refresh token validated successfully", "data": { "id": "7a95b874-…" } }
```

**Errors**

| Status | Message |
|---|---|
| `401` | `Refresh token not provided` (with `"code": "NO_SESSION"`: this browser was never signed in) / `Invalid or expired refresh token` / `Invalid refresh token payload` (the session existed but has ended: say "you've been signed out"). Send the user to sign in. |
| `403` | `Please verify your email before signing in` |

> Only this device's session is renewed; other devices are untouched. The session's "last active" time, browser and IP address are updated.

> **Frontend:** if two refresh calls run at the same time, the second one fails because the first has already replaced the token. Make sure only one refresh runs at a time, and have other requests wait for it.

---

### `POST /auth/logout`

Ends this device's session and clears both cookies. Other devices stay signed in. Works even after the access token has expired.

**Body:** none.

**Response: `200`**

```json
{ "success": true, "message": "User logged out successfully", "data": null }
```

---

### `GET /auth/me`

🔒 **Auth required.** Returns the signed-in user.

**Response: `200`**

```json
{
  "success": true,
  "message": "User details fetched successfully",
  "data": {
    "id": "7a95b874-5c81-4cf8-8c88-33f6015c7aa5",
    "firstName": "Ada",
    "lastName": "Lovelace",
    "age": null,
    "email": "ada@example.com",
    "emailVerified": true,
    "role": "user",
    "avatarUrl": "https://ik.imagekit.io/…/avatars/….png",
    "createdAt": "2026-10-21T09:12:00.000Z"
  }
}
```

`lastName`, `age` and `avatarUrl` can be `null`. `createdAt` is when the account was made ("member since"). `role` is `user` or `admin`; a UI can use it to show admin links, but the API checks it again on every admin request.

**Errors**

| Status | Message |
|---|---|
| `401` | `Token not provided` / `Invalid or expired token` / `Invalid token payload` / `Session has ended`. Try [refresh](#post-authrefresh). |
| `403` | `Please verify your email before signing in` |

`Session has ended` means this device was signed out, or the account was deleted. A refresh will fail too, so send the user to sign in.

---

### `PATCH /auth/me`

🔒 **Auth required.** Edits the signed-in user's profile. Only the fields you send change.

**Body** (at least one field)

| Field | Type | Rules |
|---|---|---|
| `firstName` | string | 2–45 characters |
| `lastName` | string \| null | Up to 45 characters. `null` or `""` removes it. |
| `age` | integer \| null | Positive. `null` removes it. |

Any other field (`email`, `role`, …) is refused with `400`, so a profile edit can't change who the user is or what they can do.

**Response: `200`**: the updated user, in the same shape as [`GET /auth/me`](#get-authme).

```json
{ "success": true, "message": "Profile updated successfully", "data": { "id": "7a95b874-…", "firstName": "Ada", "lastName": "Lovelace", "…": "…" } }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` (an unknown field, a name that's too short, or an empty body) |
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |

---

### `DELETE /auth/me`

🔒 **Auth required.** Deletes the signed-in user's account for good: their profile, photo and every session. They're signed out on every device at once, and sent a short "your account was deleted" email. Backups forget the account within 14 days.

**Body**

| Field | Type | Rules |
|---|---|---|
| `password` | string | Required. Asked again because there is no undo, so a stolen session alone can't delete the account. |

**Response: `200`** (clears both cookies)

```json
{ "success": true, "message": "Account deleted successfully", "data": { "id": "7a95b874-…" } }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` / `Password is incorrect` (a `400`, not a `401`, so a client doesn't try to refresh) |
| `403` | `Admin accounts can only be deleted on the server` (see [Admin endpoints](#admin-endpoints)) |
| `429` | 5 wrong passwords in 15 minutes |
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |

---

### `POST /auth/change-email`

🔒 **Auth required.** Starts changing the account's email. Nothing changes until the link sent to the **new** address is opened; the **current** address is told at once.

**Body**

| Field | Type | Rules |
|---|---|---|
| `newEmail` | string | Required, valid email, not the current one. Trimmed and lowercased like sign-up. |
| `password` | string | Required. Asked again, so a stolen session alone can't move the account to another inbox. |

**Response: `200`**

```json
{ "success": true, "message": "Check new@example.com for a link to confirm it", "data": null }
```

> **No enumeration.** If the new address already has an account, the response is the same; that address gets a "this email already has an account" notice instead of a link, and nothing changes. A new request replaces an earlier one, so only the latest link works. Links last **60 minutes**.

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` / `Password is incorrect` / `That is already your email` |
| `429` | 5 requests in an hour |
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |

---

### `POST /auth/confirm-email/:token`

Finishes an email change. `:token` comes from the `?token=` in the link sent to the new address. No auth needed: the link may be opened on another device.

**Body:** none.

**Response: `200`**

```json
{ "success": true, "message": "Email changed successfully", "data": { "email": "new@example.com" } }
```

The user signs in with the new address from then on. Sessions stay signed in. The **old** address is emailed that the change happened, and any password reset link still in the old inbox stops working.

**Errors**

| Status | Message |
|---|---|
| `404` | `Invalid or expired email change link` (expired, already used, or replaced by a newer request) |
| `409` | `That email now belongs to another account, so it could not be used` (someone signed up with it after the request; the request is cancelled) |
| `429` | See [Rate limits](#rate-limits) |

---

### `GET /auth/sessions`

🔒 **Auth required.** Every device signed in to this account, most recently active first.

**Response: `200`**

```json
{
  "success": true,
  "message": "Sessions fetched successfully",
  "data": [
    {
      "id": "0f3c…",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/130.0.0.0 Safari/537.36",
      "ipAddress": "203.0.113.7",
      "createdAt": "2026-11-01T09:12:00.000Z",
      "lastUsedAt": "2026-11-02T08:01:00.000Z",
      "expiresAt": "2026-11-03T08:01:00.000Z",
      "current": true
    }
  ]
}
```

`current` marks the device making the request. `userAgent` is whatever the browser sent, so treat it as a hint ("Chrome on Windows"), not proof. `userAgent` and `ipAddress` can be `null`. The browser and IP are updated each time the session is refreshed.

---

### `DELETE /auth/sessions/:id`

🔒 **Auth required.** Signs one device out. Its access and refresh tokens stop working on its next request. Ending this device's own session also clears its cookies, like [log out](#post-authlogout).

**Response: `200`**

```json
{ "success": true, "message": "Session ended successfully", "data": { "id": "0f3c…" } }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: id: …` (not a UUID) |
| `404` | `Session not found`. Also the answer for another user's session, so session IDs can't be probed. |

---

### `DELETE /auth/sessions`

🔒 **Auth required.** Signs out **every other device**; this one stays signed in.

**Response: `200`**

```json
{ "success": true, "message": "Other sessions ended successfully", "data": { "count": 2 } }
```

---

### `POST /auth/upload-avatar`

🔒 **Auth required.** Uploads or replaces the user's profile picture.

**Body:** `multipart/form-data` with **exactly one file in a field named `avatar`** and no other fields.

| Rule | Limit |
|---|---|
| Formats | JPEG, PNG, WebP (checked from the file's contents, not its name) |
| Max size | 2 MB |

```js
const form = new FormData();
form.append('avatar', fileInput.files[0]);

await fetch('/auth/upload-avatar', { method: 'POST', body: form, credentials: 'include' });
// Don't set Content-Type yourself; the browser adds the multipart boundary.
```

**Response: `200`**

```json
{ "success": true, "message": "Avatar uploaded successfully", "data": { "avatarUrl": "https://ik.imagekit.io/…/avatars/….png" } }
```

The previous avatar is deleted automatically.

**Errors**

| Status | Message |
|---|---|
| `400` | `Request must be multipart/form-data` |
| `400` | `Avatar file is required in the 'avatar' field` |
| `400` | `Avatar must be sent in the 'avatar' field` / `Only the 'avatar' file can be sent` / `Only one file can be uploaded` |
| `400` | `Only JPEG, PNG and WebP images are allowed` |
| `413` | `Avatar must be at most 2 MB` |
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |
| `502` | `Failed to upload image`. The image service is unavailable; try again. |

---

### `DELETE /auth/avatar`

🔒 **Auth required.** Removes the profile picture; the UI goes back to showing initials. Removing it when there is none is still a `200`, so a retry is safe.

**Response: `200`**

```json
{ "success": true, "message": "Avatar removed successfully", "data": { "avatarUrl": null } }
```

**Errors:** `401` / `403` as for [`GET /auth/me`](#get-authme), and `429` (shared with upload, see [Rate limits](#rate-limits)).

---

### `POST /auth/resend-verification`

Sends a new verification link to an account that signed up but hasn't confirmed its email yet. The newest link replaces the old one.

**Body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required, valid email |

**Response: `200`**

```json
{ "success": true, "message": "If this email is waiting to be confirmed, a new link has been sent", "data": null }
```

> The response is the same for an unconfirmed account, a confirmed one and no account at all, so it can't reveal who has signed up. Only an unconfirmed sign-up gets a mail. Invited users don't: they finish with the link in their invite.

> **60-second cooldown.** If the last link was sent less than a minute ago, nothing is sent (with the same response), and that link keeps working. After that, a new link replaces the old one even if it hasn't expired. A link cancelled by a wrong password can be replaced straight away. Show a countdown on the button rather than letting it be pressed again at once.

**Errors:** `400` for invalid input, `429` (see [Rate limits](#rate-limits)).

---

### `POST /auth/forgot-password`

Sends a password reset email. The link is valid for 15 minutes.

**Body**

| Field | Type | Rules |
|---|---|---|
| `email` | string | Required |

**Response: `200`**

```json
{ "success": true, "message": "If an account with this email exists, a reset password email has been sent", "data": null }
```

> The response is the same whether or not the account exists.

**Errors:** `400` for invalid input.

---

### `POST /auth/reset-password/:token`

Sets a new password. `:token` comes from the `?token=` in the reset link.

**Body**

| Field | Type | Rules |
|---|---|---|
| `newPassword` | string | Required, 6–72 characters |

**Response: `200`**

```json
{ "success": true, "message": "Password reset successfully", "data": { "id": "7a95b874-…" } }
```

> **Every device is signed out.** The user has to sign in again with the new password.

> **It also verifies the email.** The link was opened from the inbox, which proves the address just as the verification link does. This is how an [invited user](#post-adminusers) finishes setting up: the invite is a reset link for an account that has no password yet.

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` |
| `404` | `Invalid or expired reset password token`. Ask the user to request a new link. |

---

### `POST /auth/change-password`

🔒 **Auth required.** Changes the password of the signed-in user.

**Body**

| Field | Type | Rules |
|---|---|---|
| `currentPassword` | string | Required |
| `newPassword` | string | Required, 6–72 characters, different from `currentPassword` |

**Response: `200`** (sets new cookies)

```json
{ "success": true, "message": "Password changed successfully", "data": { "id": "7a95b874-…" } }
```

> **Other devices are signed out**, and this one stays signed in.

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` / `Current password is incorrect` |
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |

---

## Metrics

### `POST /metrics/visit`

Counts one visit that arrived through one of our own tagged links, such as `https://ckauth.chiragdev.com/?ref=x` in a post on X. No authentication. Nothing about the visitor is stored: no IP address, no cookie, no account, only a total per tag per day (the IP is only counted briefly by the rate limiter, like every limited endpoint).

**Body**

| Field | Type | Rules |
|---|---|---|
| `ref` | any | Required. Trimmed and lowercased, then matched against the known tags (`x` today, in `src/app/metrics/sources.ts`). Anything else, including a non-string, is ignored. |

**Response: `200`**, for a known tag and an unknown one alike, so the endpoint doesn't reveal which tags exist:

```json
{ "success": true, "message": "Visit recorded", "data": null }
```

> **Frontend:** `captureReferral()` (`frontend/src/lib/referral.ts`) posts this once per tab when the page opens with `?ref=`, removes the tag from the address bar, and keeps it in session storage so [Sign up](#post-authsign-up) can send it as `ref`.
> **Adding a tag:** add it to `referralSources` before posting links with it; until then its visits aren't counted.

---

## Admin endpoints

Every `/admin` endpoint is **🔒 Auth required** and also needs the signed-in user's `role` to be `admin`. The role is read from the database on each request, so a change takes effect immediately, not when the access token expires.

**Errors on every admin endpoint**

| Status | Message |
|---|---|
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |
| `403` | `You do not have permission to access this resource` (signed in, but not an admin) |

> **Admins are made and removed only on the server.** The API can't create an admin, demote one or delete one, including yourself. Those changes are done with `manage-users` (see [DEPLOYMENT.md](DEPLOYMENT.md#admins)), so a stolen admin session can neither lock the real admins out nor add new admins of its own.

> **Writes need a recent password confirmation ("sudo mode").** Inviting and deleting answer `403` with `"code": "REAUTH_REQUIRED"` unless the admin confirmed their password with [`POST /admin/reauth`](#post-adminreauth) in the last 15 minutes. Ask for the password, call that endpoint, then retry the request. Reading (stats, the user list, the activity log) never needs it.

> **Admin actions are recorded.** Confirming the password (right or wrong), inviting and deleting each write an event to the [activity log](#get-adminactivity), in the same database transaction as the action itself, so an action can't happen without its record.

### `GET /admin/stats`

Counts for the admin dashboard. The user counts come from one query; `referrals` from two more.

**Response: `200`**

```json
{
  "success": true,
  "message": "Stats fetched successfully",
  "data": {
    "totalUsers": 42, "verifiedUsers": 37, "admins": 1,
    "newLast24Hours": 1, "newThisWeek": 5, "newThisMonth": 12, "newThisYear": 42,
    "referrals": [
      { "source": "x", "visits": 120, "signUps": 6, "verified": 4 }
    ]
  }
}
```

The four `new…` fields count accounts created within a **rolling window** back from the moment of the request (not since the start of a calendar week or month): the last 24 hours, 7 days, 30 days and 365 days. All four come from one pass over the table, so a client can switch between them without another request.

`referrals` covers the last 30 days, one entry per tag, sorted by tag, and is empty until a tagged link is used. `visits` are [counted visits](#post-metricsvisit); `signUps` are accounts created in the window with that sign-up source, and `verified` the ones among them that confirmed their email. A deleted account leaves its tag's `signUps` but its visit still counts, so `signUps / visits` is the tag's sign-up rate.

---

### `GET /admin/users`

One page of users, newest first, optionally filtered by a search.

**Query parameters**

| Parameter | Type | Rules |
|---|---|---|
| `page` | integer | Optional, ≥ 1, default `1` |
| `limit` | integer | Optional, 1–100, default `20` |
| `search` | string | Optional, up to 100 characters. Matches anywhere in the first name, last name or email, ignoring case. `%` and `_` are plain characters, not wildcards. `pagination.total` then counts only the matches. |

**Response: `200`**

```json
{
  "success": true,
  "message": "Users fetched successfully",
  "data": {
    "users": [
      {
        "id": "7a95b874-5c81-4cf8-8c88-33f6015c7aa5",
        "firstName": "Ada",
        "lastName": "Lovelace",
        "age": null,
        "email": "ada@example.com",
        "emailVerified": true,
        "role": "user",
        "avatarUrl": null,
        "createdAt": "2026-11-02T06:00:00.000Z",
        "lastActiveAt": "2026-11-02T09:41:00.000Z",
        "deviceCount": 2
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 42 }
  }
}
```

`lastActiveAt` is when any of the user's live sessions was last used, and `deviceCount` how many live sessions they have; `null` and `0` mean they aren't signed in anywhere. The device list itself (browser, IP) stays private to the user.

Passwords, token hashes and internal file IDs are never returned. A `page` past the end returns an empty `users` list.

---

### `GET /admin/activity`

One page of the **activity log** (an [audit log](GLOSSARY.md#logs-and-monitoring): who did what, to whose account, and when), newest first. Each event was written in the same database transaction as the action it records.

**Query parameters**

| Parameter | Type | Rules |
|---|---|---|
| `page` | integer | Optional, ≥ 1, default `1` |
| `limit` | integer | Optional, 1–100, default `20` |
| `action` | string | Optional, one of the actions below |
| `userId` | UUID | Optional. One person's log: everything they did **and** everything done to their account |

**Actions**

| `action` | Recorded when | `actorId` → `targetId` | `details` |
|---|---|---|---|
| `sign_in` | a sign-in succeeds | the user → themselves | `newDevice`: whether this browser had no live session |
| `sign_in_failed` | a wrong password for an **existing** account (an unknown email records nothing) | none → the account | |
| `email_verified` | a verify link is used | the user → themselves | |
| `password_changed` | `POST /auth/change-password` | the user → themselves | |
| `password_reset` | a reset link is used | the user → themselves | `firstPassword`: `true` when it finished an invite |
| `email_change_requested` | `POST /auth/change-email` with the right password, whether or not the new address is taken (so the log can't tell) | the user → themselves | none: the new address may belong to someone else |
| `email_changed` | a new email is confirmed | the user → themselves | `previousEmail` |
| `profile_updated` | `PATCH /auth/me` | the user → themselves | which fields changed |
| `avatar_changed` | a photo is uploaded, or removed (removing one that's already gone records nothing) | the user → themselves | `removed`: `true` for a removal |
| `sessions_revoked` | `DELETE /auth/sessions/:id`, or `DELETE /auth/sessions` that signed at least one device out | the user → themselves | `count`: devices signed out; `current`: whether it was this device |
| `account_deleted` | `DELETE /auth/me` | the user → themselves | `email`, kept since the account is gone |
| `admin_reauth` / `admin_reauth_failed` | `POST /admin/reauth`, right or wrong password | the admin → themselves | |
| `user_invited` | `POST /admin/users` | the admin → the new account | |
| `user_deleted` | `DELETE /admin/users/:id`, or `manage-users delete` on the server | the admin (none from the server) → the account | `email`, kept since the account is gone |
| `role_changed` | `manage-users role` on the server | none → the account | `role` |

**Response: `200`**

```json
{
  "success": true,
  "message": "Activity fetched successfully",
  "data": {
    "events": [
      {
        "id": "0b7d…",
        "action": "user_invited",
        "source": "api",
        "details": null,
        "requestId": "f9de846b-2052-4ccb-9665-c5a63edc764e",
        "createdAt": "2026-11-02T12:02:00.000Z",
        "actorId": "a1f3…", "actorEmail": "chirag@example.com", "actorFirstName": "Chirag",
        "targetId": "7a95…", "targetEmail": "dev@example.com", "targetFirstName": "Dev"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 93 }
  }
}
```

- `source` is `api`, or `cli` for `manage-users` on the server, which has no actor.
- `actorEmail`/`targetEmail` and the first names are looked up at read time, so they're `null` once that account is deleted; `details.email` then still says who it was.
- `requestId` is the request's [`X-Request-Id`](#request-ids), for finding its lines in the server logs.
- The **IP address is stored but never returned**, like the device list in [`GET /admin/users`](#get-adminusers): an admin needs to know what happened, not where people are.
- Events are kept for a limited time and then deleted automatically: `sign_in`, `sign_in_failed` and `admin_reauth` for **90 days**, everything else for **one year**.

**Errors:** `400` for an unknown `action`, a `userId` that isn't a UUID, or `limit` over 100.

---

### `POST /admin/reauth`

Confirms the signed-in admin's password, which allows invites and deletes for the next **15 minutes**, **on this device only**: it's stored on the session, so another signed-in device has to confirm its own. Signing out, or changing or resetting the password, ends it early.

**Body**

| Field | Type | Rules |
|---|---|---|
| `password` | string | Required |

**Response: `200`**

```json
{ "success": true, "message": "Password confirmed", "data": { "expiresAt": "2026-11-02T08:15:00.000Z" } }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Incorrect password` (a `400`, not a `401`: the session is fine, so a client shouldn't try to refresh it) |
| `429` | 5 wrong passwords in 15 minutes. See [Rate limits](#rate-limits) |

---

### `POST /admin/users`

**Invites** someone. The account is created without a password and unverified, and the person is emailed a link to choose their password. The link lasts **72 hours** and is a reset link (`/reset-password?token=…&invite=1`), so using it sets the password and verifies the email in one step. Nobody can sign in to the account before that. If the link expires, "Forgot password" sends a new one. The admin never knows the person's password.

🔑 Needs a recent password confirmation (`REAUTH_REQUIRED` otherwise).

**Body**

| Field | Type | Rules |
|---|---|---|
| `firstName` | string | Required, 2–45 characters |
| `lastName` | string \| null | Optional, up to 45 characters |
| `email` | string | Required, valid email, up to 254 characters |

Any other field, such as `role` or `password`, is refused with a `400`: invited accounts are always `user`.

**Response: `201`**: the new user (with `emailVerified: false`), in the same shape as one entry of [`GET /admin/users`](#get-adminusers).

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: …` (including an unknown field) |
| `403` | `Confirm your password to continue` with `"code": "REAUTH_REQUIRED"` |
| `409` | `A user with this email already exists`. Unlike sign-up, this endpoint says so: admins can already see every account. No mail is sent. |
| `429` | See [Rate limits](#rate-limits) |

---

### `DELETE /admin/users/:id`

Deletes a user and their profile picture. Their sessions end at once: the next request with their access token gets `401 Session has ended`. If their email was verified, they're sent a short "your account was deleted" email; an unverified address may belong to someone else, so it gets nothing. The delete is permanent: there is no soft delete, because the Privacy Policy promises deletion.

🔑 Needs a recent password confirmation (`REAUTH_REQUIRED` otherwise).

**Response: `200`**

```json
{ "success": true, "message": "User deleted successfully", "data": { "id": "7a95b874-…" } }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid input fields: id: Invalid user id` |
| `403` | `Not to be deleted: an admin cannot delete their own account` / `Not to be deleted: an admin cannot delete another admin account` / `Confirm your password to continue` (`REAUTH_REQUIRED`) |
| `404` | `User not found` |
| `429` | See [Rate limits](#rate-limits) |

---

## Typical flows

### New user

```
POST /auth/sign-up                 → 201, show "check your inbox"
   (user clicks the email link → your /verify-email?token=… page)
POST /auth/verify-email/:token     → 200, with { password }, cookies set (signed in)
GET  /auth/me                      → 200
```

### Session expired

```
GET  /auth/me                      → 401
POST /auth/refresh                 → 200, new cookies
GET  /auth/me                      → 200 (retry)
   (if refresh returns 401 → go to sign in)
```

### Forgot password

```
POST /auth/forgot-password         → 200, show "check your inbox"
   (user clicks the email link → your /reset-password?token=… page)
POST /auth/reset-password/:token   → 200, with { newPassword }
POST /auth/sign-in                 → 200
```
