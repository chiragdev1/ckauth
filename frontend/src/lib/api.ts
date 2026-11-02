// every response from the api has this shape (see docs/API.md, "Response format")
type ApiEnvelope<T> = {
  success: boolean
  message: string
  data: T
  // only on the few errors a client handles specially, e.g. REAUTH_REQUIRED
  code?: string
}

export class ApiRequestError extends Error {
  status: number
  code: string | undefined

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type User = {
  id: string
  firstName: string
  lastName: string | null
  age: number | null
  email: string
  emailVerified: boolean
  role: 'user' | 'admin'
  avatarUrl: string | null
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  // only protected endpoints refresh on 401; on sign-in or verify-email a 401 means wrong password
  authed?: boolean
}

async function rawRequest<T>(path: string, { method = 'GET', body }: RequestOptions): Promise<ApiEnvelope<T>> {
  const isForm = body instanceof FormData
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    // the browser sets the multipart boundary itself, so FormData must not get a Content-Type
    headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  })

  // caddy or a crashed api can return html or nothing, so don't assume json
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null
  if(!response.ok || !payload) {
    throw new ApiRequestError(response.status, payload?.message ?? 'Something went wrong, please try again', payload?.code)
  }
  return payload
}

// shared by every request that hits a 401 at the same moment
let refreshInFlight: Promise<boolean> | null = null

// returns true if the session was refreshed and the original request is worth retrying
function refreshSession(): Promise<boolean> {
  // rawRequest, not api(): a 401 from /auth/refresh must not trigger another refresh
  refreshInFlight ??= rawRequest('/auth/refresh', { method: 'POST' })
    // a failed refresh means "signed out", so callers get the original 401 instead of a new error
    .then(() => true, () => false)
    // cleared only once settled, so every 401 that arrives while it runs reuses the same refresh
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  try {
    return await rawRequest<T>(path, options)
  } catch (error) {
    if(options.authed && error instanceof ApiRequestError && error.status === 401 && await refreshSession()) {
      return rawRequest<T>(path, options)
    }
    throw error
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong, please try again'
}
