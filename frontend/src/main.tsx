import { createRoot, hydrateRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import './index.css'
import { App, routes } from './app.tsx'

// a deploy replaces the hashed chunks, so a tab opened before it can't load a lazy page any more. reload once to pick up
// the new build; the timestamp stops a loop if the chunk is missing for another reason (then pages/route-error.tsx shows)
window.addEventListener('vite:preloadError', event => {
  try {
    const last = Number(sessionStorage.getItem('ckauth-chunk-reload'))
    if(Date.now() - last < 10_000) return
    sessionStorage.setItem('ckauth-chunk-reload', String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

const container = document.getElementById('root')!
const app = <App router={createBrowserRouter(routes)} />

// scripts/prerender.js marks the html it rendered at build time; only hydrate when that html is for this url,
// so a page served the empty shell (or `vite preview`'s fallback) renders from scratch instead
if(container.dataset.prerendered === window.location.pathname) {
  hydrateRoot(container, app)
} else {
  container.replaceChildren()
  createRoot(container).render(app)
}
