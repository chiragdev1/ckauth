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
  - [Get current user](#get-authme) · [Upload avatar](#post-authupload-avatar)
  - [Forgot password](#post-authforgot-password) · [Reset password](#post-authreset-passwordtoken) · [Change password](#post-authchange-password)
- [Admin endpoints](#admin-endpoints): [stats](#get-adminstats) · [list users](#get-adminusers) · [confirm password](#post-adminreauth) · [invite user](#post-adminusers) · [delete user](#delete-adminusersid)
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
- **"Signed out" takes effect gradually.** When a session is ended (logout, password reset or change), its refresh token stops working immediately. An access token that was already issued keeps working until it expires (`ACCESS_TOKEN_EXPIRY`, e.g. up to 15 min).

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
| `POST /auth/forgot-password` | 10 per hour | IP address |
| `POST /auth/forgot-password` | 3 per hour | Email address |
| `POST /auth/verify-email/:token` | 20 per 15 min | IP address |
| `POST /auth/reset-password/:token` | 20 per 15 min | IP address |
| `POST /auth/refresh` | 60 per minute | IP address |
| `POST /auth/change-password` | 5 per 15 min | Signed-in user |
| `POST /auth/upload-avatar` | 10 per hour | Signed-in user |
| `POST /admin/users` and `DELETE /admin/users/:id` | 30 per 15 min, shared | Signed-in admin |
| `POST /admin/reauth` | 5 **wrong passwords** per 15 min | Signed-in admin |

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
| `/forgot-password` | "Account already exists" email | Your forgot-password page. |

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
| `403` | `Please verify your email before signing in, check your inbox for the verification link` | The email isn't verified. If the last link had expired, a new one has just been sent. |

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
| `401` | `Refresh token not provided` / `Invalid or expired refresh token` / `Invalid refresh token payload`. Send the user to sign in. |
| `403` | `Please verify your email before signing in` |

> **Frontend:** if two refresh calls run at the same time, the second one fails because the first has already replaced the token. Make sure only one refresh runs at a time, and have other requests wait for it.

---

### `POST /auth/logout`

Ends the current session and clears both cookies. Works even after the access token has expired.

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
    "avatarUrl": "https://ik.imagekit.io/…/avatars/….png"
  }
}
```

`lastName`, `age` and `avatarUrl` can be `null`. `role` is `user` or `admin`; a UI can use it to show admin links, but the API checks it again on every admin request.

**Errors**

| Status | Message |
|---|---|
| `401` | `Token not provided` / `Invalid or expired token` / `Invalid token payload` / `User not found`. Try [refresh](#post-authrefresh). |
| `403` | `Please verify your email before signing in` |

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

## Admin endpoints

Every `/admin` endpoint is **🔒 Auth required** and also needs the signed-in user's `role` to be `admin`. The role is read from the database on each request, so a change takes effect immediately, not when the access token expires.

**Errors on every admin endpoint**

| Status | Message |
|---|---|
| `401` / `403` | Same as [`GET /auth/me`](#get-authme) |
| `403` | `You do not have permission to access this resource` (signed in, but not an admin) |

> **Admins are made and removed only on the server.** The API can't create an admin, demote one or delete one, including yourself. Those changes are done with `manage-users` (see [DEPLOYMENT.md](DEPLOYMENT.md#admins)), so a stolen admin session can neither lock the real admins out nor add new admins of its own.

> **Writes need a recent password confirmation ("sudo mode").** Inviting and deleting answer `403` with `"code": "REAUTH_REQUIRED"` unless the admin confirmed their password with [`POST /admin/reauth`](#post-adminreauth) in the last 15 minutes. Ask for the password, call that endpoint, then retry the request. Reading (stats, the user list) never needs it.

### `GET /admin/stats`

Counts for the admin dashboard, all taken in one query.

**Response: `200`**

```json
{
  "success": true,
  "message": "Stats fetched successfully",
  "data": { "totalUsers": 42, "verifiedUsers": 37, "admins": 1, "newThisWeek": 5 }
}
```

`newThisWeek` counts accounts created in the last 7 days.

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
        "createdAt": "2026-11-02T06:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 42 }
  }
}
```

Passwords, token hashes and internal file IDs are never returned. A `page` past the end returns an empty `users` list.

---

### `POST /admin/reauth`

Confirms the signed-in admin's password, which allows invites and deletes for the next **15 minutes**. Signing out, or resetting the password, ends it early.

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

Deletes a user and their profile picture. Their sessions end at once: the next request with their access token gets `401 User not found`. If their email was verified, they're sent a short "your account was deleted" email; an unverified address may belong to someone else, so it gets nothing. The delete is permanent: there is no soft delete, because the Privacy Policy promises deletion.

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
