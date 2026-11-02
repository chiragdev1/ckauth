import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiRequestError, onSessionEnded, type User } from './api.ts'

type AuthState = {
  user: User | null
  // true until the first /auth/me answers, so protected pages don't flash a redirect
  loading: boolean
  reloadUser: () => Promise<User | null>
  signOut: () => Promise<void>
  // this browser had a session that stopped working; the sign-in page explains it, and signing in clears it
  sessionEnded: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionEnded, setSessionEnded] = useState(false)

  const reloadUser = useCallback(async () => {
    try {
      const { data } = await api<User>('/auth/me', { authed: true })
      setUser(data)
      setSessionEnded(false)
      return data
    } catch (error) {
      // 401/403 just mean "not signed in"; anything else is logged but treated the same
      if(!(error instanceof ApiRequestError) || ![401, 403].includes(error.status)) {
        console.error(error)
      }
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    // logout always clears the cookies server side, so drop local state even if the call fails
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  useEffect(() => {
    reloadUser()
  }, [reloadUser])

  // any request can find out mid-visit, e.g. a device list action after this device was signed out elsewhere;
  // dropping the user makes RequireAuth send them to sign in, where the notice explains why
  useEffect(() => onSessionEnded(() => {
    setSessionEnded(true)
    setUser(null)
  }), [])

  return (
    <AuthContext.Provider value={{ user, loading, reloadUser, signOut, sessionEnded }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if(!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
