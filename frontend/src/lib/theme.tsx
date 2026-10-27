import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

// same key as public/theme-init.js, which applies the theme before react loads
const STORAGE_KEY = 'ckauth-theme'

type ThemeState = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  systemTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // storage can throw in private windows; fall back to the os setting
    return 'system'
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  // no window while the home page is prerendered at build time; nothing rendered depends on this, so hydration still matches
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && darkQuery().matches)

  // follow the os live while the user hasn't picked a theme
  useEffect(() => {
    const query = darkQuery()
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const systemTheme = systemDark ? 'dark' : 'light'
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      if(next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted, but still applied for this visit
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, systemTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if(!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return context
}
