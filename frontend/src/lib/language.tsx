import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// english or hindi for the landing page words (pages/home-copy.ts); the app pages stay english for now
export type Language = 'en' | 'hi'

const STORAGE_KEY = 'ckauth-language'

// runs after the first render, so the prerendered english html hydrates cleanly before anything switches
// a saved choice wins; otherwise english, since most indian phones report en-IN whatever their owner reads,
// and the switch in the header is always one tap away
function preferredLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
  }
}

const LanguageContext = createContext<{ language: Language, setLanguage: (language: Language) => void }>({ language: 'en', setLanguage: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  // always english on the first pass: the server can't know the visitor's choice, and a mismatch wouldn't be fixed on hydration
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    setLanguageState(preferredLanguage())
  }, [])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // only lasts for this visit
    }
  }, [])

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
