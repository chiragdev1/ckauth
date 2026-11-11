import { useCallback, useEffect, useState } from 'react'
import { api, type User } from './api.ts'
import { describeError } from './validation.ts'

// the fields GET /admin/users returns (docs/API.md); the same as /auth/me plus when and on how many devices they're signed in
export type AdminUser = User & { lastActiveAt: string | null, deviceCount: number }

export type AdminStats = {
  totalUsers: number
  verifiedUsers: number
  admins: number
  // rolling windows back from now (docs/API.md)
  newLast24Hours: number
  newThisWeek: number
  newThisMonth: number
  newThisYear: number
  // the last 30 days per ?ref= source; visits are counted per tab, sign-ups by the account's signup_source
  referrals: { source: string, visits: number, signUps: number, verified: number }[]
}

type Page<K extends string, T> = Record<K, T[]> & { pagination: { page: number, limit: number, total: number } }

export const ADMIN_PAGE_SIZE = 20
// long enough that typing a name sends one request, not one per letter
const SEARCH_DELAY_MS = 300

// stats and one page of users, fetched together so the numbers and the list never disagree after a change
export function useAdminData() {
  const [page, setPage] = useState(1)
  const [search, setSearchText] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [list, setList] = useState<Page<'users', AdminUser> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  // a new search starts from the first page
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    // a slow response for an old page or search must not overwrite a newer one
    let cancelled = false
    setLoading(true)

    const query = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) })
    if(appliedSearch) query.set('search', appliedSearch)

    Promise.all([
      api<AdminStats>('/admin/stats', { authed: true }),
      api<Page<'users', AdminUser>>(`/admin/users?${query}`, { authed: true }),
    ]).then(([statsResponse, usersResponse]) => {
      if(cancelled) return
      // deleting the last user on the last page leaves it empty, so step back a page instead of showing nothing
      if(usersResponse.data.users.length === 0 && page > 1) {
        setPage(page - 1)
        return
      }
      setStats(statsResponse.data)
      setList(usersResponse.data)
      setError(null)
    }, caught => {
      if(!cancelled) setError(describeError(caught).formError ?? 'Could not load users, please try again')
    }).finally(() => {
      if(!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [page, appliedSearch, version])

  const reload = useCallback(() => setVersion(current => current + 1), [])

  const total = list?.pagination.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))

  return {
    stats, users: list?.users ?? [], total, page, totalPages, setPage,
    search, setSearch: setSearchText, searching: appliedSearch !== '',
    loading, error, reload,
  }
}

// one row of GET /admin/activity (docs/API.md). the joined names are null once that account is deleted;
// details.email then still says who it was
export type ActivityEvent = {
  id: string
  action: ActivityAction
  source: 'api' | 'cli'
  details: Record<string, string | number | boolean> | null
  requestId: string | null
  createdAt: string
  actorId: string | null
  targetId: string | null
  actorEmail: string | null
  actorFirstName: string | null
  targetEmail: string | null
  targetFirstName: string | null
}

// the api's auditActions (src/app/auth/utils/constants.ts), with the label the type filter shows
export const activityActions = {
  sign_in: 'Signed in',
  sign_in_failed: 'Wrong password at sign-in',
  email_verified: 'Email verified',
  password_changed: 'Password changed',
  password_reset: 'Password reset',
  email_change_requested: 'Email change requested',
  email_changed: 'Email changed',
  profile_updated: 'Profile edited',
  avatar_changed: 'Photo changed',
  sessions_revoked: 'Devices signed out',
  account_deleted: 'Deleted own account',
  admin_reauth: 'Admin password confirmed',
  admin_reauth_failed: 'Wrong admin password',
  user_invited: 'User invited',
  user_deleted: 'User deleted',
  role_changed: 'Role changed',
} as const

export type ActivityAction = keyof typeof activityActions

export const ACTIVITY_PAGE_SIZE = 25

export type ActivityFilter = { action: ActivityAction | null, user: { id: string, label: string } | null }

// one page of the activity log, refetched when the filter or page changes
export function useActivity() {
  const [page, setPage] = useState(1)
  const [filter, setFilterState] = useState<ActivityFilter>({ action: null, user: null })
  const [list, setList] = useState<Page<'events', ActivityEvent> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const query = new URLSearchParams({ page: String(page), limit: String(ACTIVITY_PAGE_SIZE) })
    if(filter.action) query.set('action', filter.action)
    if(filter.user) query.set('userId', filter.user.id)

    api<Page<'events', ActivityEvent>>(`/admin/activity?${query}`, { authed: true }).then(response => {
      if(cancelled) return
      setList(response.data)
      setError(null)
    }, caught => {
      if(!cancelled) setError(describeError(caught).formError ?? 'Could not load activity, please try again')
    }).finally(() => {
      if(!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [page, filter, version])

  const reload = useCallback(() => setVersion(current => current + 1), [])
  // a new filter starts from the first page
  const setFilter = useCallback((next: Partial<ActivityFilter>) => {
    setFilterState(current => ({ ...current, ...next }))
    setPage(1)
  }, [])

  const total = list?.pagination.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))

  return { events: list?.events ?? [], total, page, totalPages, setPage, filter, setFilter, loading, error, reload }
}
