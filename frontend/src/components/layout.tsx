import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link, Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { Languages } from 'lucide-react'
import { useAuth } from '@/lib/auth.tsx'
import { useLanguage } from '@/lib/language.tsx'
import { cn } from '@/lib/utils.ts'
import { CONTACT_EMAIL, homeCopy } from '@/pages/home-copy.ts'
import { Logo, Spinner } from '@/components/brand.tsx'
import { ThemeToggle } from '@/components/theme-toggle.tsx'
import { Button } from '@/components/ui/button.tsx'

// signed-in only, so its menu code stays out of the bundle every visitor downloads (user-menu.tsx)
const UserMenu = lazy(() => import('@/components/user-menu.tsx'))

export function Layout() {
  const { pathname } = useLocation()
  const { language } = useLanguage()
  const main = useRef<HTMLElement>(null)
  const shownPath = useRef(pathname)

  // an spa navigation leaves focus on the link that was clicked, so screen readers hear nothing about the new page.
  // move it to <main>, unless the page already focused something inside it (autoFocus on reset/verify)
  useEffect(() => {
    if(shownPath.current === pathname) return
    shownPath.current = pathname
    if(!main.current?.contains(document.activeElement)) main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      {/* new pages start at the top, and back/forward return to where you were */}
      <ScrollRestoration />
      <a href="#main" lang={language} className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {homeCopy[language].nav.skip}
      </a>
      <SiteHeader />
      <main id="main" ref={main} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {/* the app pages are lazy-loaded (app.tsx); header and footer stay put while one arrives */}
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { language, setLanguage } = useLanguage()
  const onHome = pathname === '/'
  const nav = homeCopy[language].nav

  return (
    <header lang={language} className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Logo />
        {onHome && (
          <div className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">{nav.features}</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">{nav.howItWorks}</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">{nav.pricing}</a>
            <a href="#faq" className="transition-colors hover:text-foreground">{nav.faq}</a>
          </div>
        )}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* only the home page has hindi words so far; icon-only on phones, where the header has room for four controls */}
          {onHome && (
            <Button variant="ghost" onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')} aria-label={nav.switchLabel} lang={language === 'en' ? 'hi' : 'en'} className="size-10 px-0 sm:size-auto sm:h-9 sm:px-3">
              <Languages /><span className="hidden sm:inline">{nav.switchTo}</span>
            </Button>
          )}
          <ThemeToggle />
          {/* signed-out buttons while the session check runs: most visitors are signed out, and the prerendered home page
              can't know, so this is what it shows. a signed-in user sees them swap for the menu once /auth/me answers */}
          {user ? (
            <Suspense fallback={<div className="size-9" />}>
              <UserMenu />
            </Suspense>
          ) : (
            <>
              {/* phones show one of the two, the one you're not on; the hero has the big sign-up button */}
              <Button asChild variant="ghost" className={cn('h-10 sm:h-9', pathname === '/sign-in' && 'hidden sm:inline-flex')}>
                <Link to="/sign-in">{nav.signIn}</Link>
              </Button>
              <Button asChild className={cn('h-10 sm:h-9', pathname !== '/sign-in' && 'hidden sm:inline-flex')}>
                <Link to="/sign-up">{nav.tryFree}</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

function SiteFooter() {
  const { language } = useLanguage()
  const footer = homeCopy[language].footer

  return (
    <footer lang={language} className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <div className="text-center sm:text-left">
          <p>© {new Date().getFullYear()} CKAuth · {footer.tagline}</p>
          <p className="mt-1">{footer.question} <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">{CONTACT_EMAIL}</a></p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link to="/sign-in" className="hover:text-foreground">{footer.signIn}</Link>
          <Link to="/sign-up" className="hover:text-foreground">{footer.createAccount}</Link>
          <Link to="/forgot-password" className="hover:text-foreground">{footer.forgot}</Link>
          <Link to="/privacy" className="hover:text-foreground">{footer.privacy}</Link>
          <Link to="/terms" className="hover:text-foreground">{footer.terms}</Link>
        </div>
      </div>
    </footer>
  )
}

// the server is the real gate (authenticateToken); this only spares signed-out users a broken page
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if(loading) return <Spinner />
  if(!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  return <Outlet />
}

// signed-in users have no reason to see sign-in or sign-up
// the form shows straight away instead of waiting on the session check (two round trips for a signed-out visitor)
export function GuestOnly() {
  const { user } = useAuth()

  if(user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
