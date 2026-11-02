import { useCallback, useEffect, useState } from 'react'
import { api, type User } from './api.ts'
import { describeError } from './validation.ts'

// the fields GET /admin/users returns (docs/API.md); the same as /auth/me plus the signup date
export type AdminUser = User & { createdAt: string }

export type AdminStats = {
  totalUsers: number
  verifiedUsers: number
  admins: number
  newThisWeek: number
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
