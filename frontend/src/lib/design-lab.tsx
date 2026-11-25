import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// a dev-only switcher for comparing candidate designs on the real pages before picking one.
// to try alternatives: add entries to `looks`, add their `:root[data-look="<id>"]` (and `.dark`) token blocks in index.css,
// and branch on useLook() where a candidate needs different markup. once one is chosen, promote it to the default and delete the rest.
// only dev builds (or a build with VITE_DESIGN_LAB=1) can switch; production always renders the default look
export const LAB_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DESIGN_LAB === '1'

type LookOption = { id: string, name: string, blurb: string, swatch: string[] }

// the first entry is the shipped design; the panel only appears once there is something to compare it with
export const looks: LookOption[] = [
  { id: 'guard', name: 'Guard', blurb: 'Current · slate and ember', swatch: ['#c2410c', '#0f172a', '#f7f8fb'] },
]

const STORAGE_KEY = 'ckauth-look'
const DEFAULT_LOOK = looks[0]!.id

function isLook(value: string | null): value is string {
  return looks.some(look => look.id === value)
}

// ?look=<id> wins, so a link can open a specific candidate; otherwise the last one picked
function initialLook() {
  // no window during the build-time prerender, even in a VITE_DESIGN_LAB=1 build
  if(!LAB_ENABLED || typeof window === 'undefined') return DEFAULT_LOOK
  const fromUrl = new URLSearchParams(window.location.search).get('look')
  if(isLook(fromUrl)) return fromUrl
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLook(stored) ? stored : DEFAULT_LOOK
  } catch {
    return DEFAULT_LOOK
  }
}

const LookContext = createContext<{ look: string, setLook: (look: string) => void }>({ look: DEFAULT_LOOK, setLook: () => {} })

export function LookProvider({ children }: { children: ReactNode }) {
  const [look, setLookState] = useState(initialLook)

  // saved here rather than only in setLook, so a look opened from ?look= survives reloads and new tabs too
  useEffect(() => {
    document.documentElement.dataset.look = look
    if(!LAB_ENABLED) return
    try {
      localStorage.setItem(STORAGE_KEY, look)
    } catch {
      // only lasts for this visit
    }
  }, [look])

  const setLook = useCallback((next: string) => {
    if(LAB_ENABLED && isLook(next)) setLookState(next)
  }, [])

  return <LookContext.Provider value={{ look, setLook }}>{children}</LookContext.Provider>
}

export function useLook() {
  return useContext(LookContext)
}
