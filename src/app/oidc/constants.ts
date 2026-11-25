// the one list of scopes sign in with ckauth understands. the discovery document advertises it, and the database's
// oauth_scope enum is made from it, so a client can't be registered with, or granted, a scope the code doesn't handle.
// adding one is an `ALTER TYPE … ADD VALUE` migration (backwards-compatible); removing one isn't, so think first
export const oidcScopes = ['openid', 'profile', 'email', 'offline_access'] as const

// confidential: a server that can keep a secret (authenticates at /token with it). public: a single-page or native app
// that can't, so it has no secret and relies on pkce alone (docs/OIDC.md, rule 8)
export const oauthClientTypes = ['confidential', 'public'] as const

// disabled revokes everything at once: every check reads this, and disabling also deletes the app's refresh tokens.
// there is deliberately no third state: no "trusted", no "internal" (rule 27)
export const oauthClientStatuses = ['active', 'disabled'] as const
