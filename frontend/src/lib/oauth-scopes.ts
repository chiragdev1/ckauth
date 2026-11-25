import type { User } from './api.ts'

// one line on the consent screen: what the app will learn, with the person's own value beside it
// (docs/OIDC.md, rule 33: shown "asha@example.com", not "your email address")
export type ScopeRow = { scope: string, label: string, value?: string }

// the scopes the api can grant (docs/OIDC.md, Endpoints). the server only sends the consent page scopes the app is
// registered for (rule 20), so anything else reaching here is a bug in the api, not something an app chose.
// listed in the order the consent screen shows them, whatever order the app asked in: data first, lasting access last
export const knownScopes = {
  profile: 'Your name',
  email: 'Your email address',
  openid: 'Who you are',
  offline_access: 'Stay connected',
} as const

export type KnownScope = keyof typeof knownScopes

export function displayName(user: Pick<User, 'firstName' | 'lastName'>) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ')
}

// turns the requested scopes into the rows the consent screen lists, in the order they're shown
export function describeScopes(scopes: string[], user: Pick<User, 'firstName' | 'lastName' | 'email'>): ScopeRow[] {
  const requested = new Set(scopes)
  // a permission nobody can read must not be agreed to: fail loudly (RouteError catches it) rather than hide it
  // hasOwn, not `in`: `in` also finds inherited keys, so a scope called "toString" would pass as known
  const unknown = scopes.filter(scope => !Object.hasOwn(knownScopes, scope))
  if(unknown.length) throw new Error(`Unknown scopes on the consent screen: ${unknown.join(', ')}`)

  const values: Partial<Record<KnownScope, string>> = {
    profile: displayName(user),
    email: user.email,
    // openid shares no data, only the pairwise id, so it's listed only when nothing else says who the app learns about
    openid: 'An ID only this app gets',
    offline_access: 'Even after you close it',
  }
  const sharesData = requested.has('profile') || requested.has('email')

  return (Object.keys(knownScopes) as KnownScope[])
    .filter(scope => requested.has(scope) && !(scope === 'openid' && sharesData))
    .map(scope => ({ scope, label: knownScopes[scope], value: values[scope] }))
}
