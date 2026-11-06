import { api } from './api.ts'

const STORAGE_KEY = 'ckauth-ref'

// a tagged link (?ref=x, from our own posts) is counted once per tab, then kept so sign-up can say where the person came
// from. the api decides which sources are real; session storage, so it's gone when the tab closes and nothing follows you
export function captureReferral() {
  const url = new URL(window.location.href)
  const ref = url.searchParams.get('ref')
  if(!ref) return

  // the address bar loses the tag, so a refresh doesn't count twice and a copied link isn't credited to us
  url.searchParams.delete('ref')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)

  try {
    if(sessionStorage.getItem(STORAGE_KEY) === ref) return
    sessionStorage.setItem(STORAGE_KEY, ref)
  } catch {
    // storage blocked (some private modes): still count the visit, sign-up just won't know the source
  }
  // a lost count is no reason to bother the visitor
  api('/metrics/visit', { method: 'POST', body: { ref } }).catch(() => {})
}

export function referralSource(): string | undefined {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}
