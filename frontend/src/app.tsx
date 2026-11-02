import { lazy, StrictMode, type ComponentProps } from 'react'
import type { RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './lib/auth.tsx'
import { ThemeProvider } from './lib/theme.tsx'
import { LookProvider } from './lib/design-lab.tsx'
import { LanguageProvider } from './lib/language.tsx'
import { GuestOnly, Layout, RequireAdmin, RequireAuth } from './components/layout.tsx'
import { Home } from './pages/home.tsx'
import { NotFound } from './pages/not-found.tsx'
import { RouteError } from './pages/route-error.tsx'
import { DesignLabPanel } from './components/design-lab-panel.tsx'

// the home page is prerendered and every visitor lands there first, so it ships in the main bundle;
// the app pages load on demand (Layout wraps them in Suspense)
const SignUp = lazy(() => import('./pages/sign-up.tsx').then(module => ({ default: module.SignUp })))
const SignIn = lazy(() => import('./pages/sign-in.tsx').then(module => ({ default: module.SignIn })))
const VerifyEmail = lazy(() => import('./pages/verify-email.tsx').then(module => ({ default: module.VerifyEmail })))
const ForgotPassword = lazy(() => import('./pages/forgot-password.tsx').then(module => ({ default: module.ForgotPassword })))
// development only, like the design lab. written out here rather than imported as LAB_ENABLED: vite replaces
// import.meta.env values in place, so a production build sees `false` and drops the page, while an imported constant
// isn't folded across modules and would ship it
const DevEmails = import.meta.env.DEV || import.meta.env.VITE_DESIGN_LAB === '1' ? lazy(() => import('./pages/dev-emails.tsx').then(module => ({ default: module.DevEmails }))) : null
const ConfirmEmail = lazy(() => import('./pages/confirm-email.tsx').then(module => ({ default: module.ConfirmEmail })))
const ResetPassword = lazy(() => import('./pages/reset-password.tsx').then(module => ({ default: module.ResetPassword })))
const Admin = lazy(() => import('./pages/admin.tsx').then(module => ({ default: module.Admin })))
const Dashboard = lazy(() => import('./pages/dashboard.tsx').then(module => ({ default: module.Dashboard })))
const PrivacyPolicy = lazy(() => import('./pages/legal.tsx').then(module => ({ default: module.PrivacyPolicy })))
const Terms = lazy(() => import('./pages/legal.tsx').then(module => ({ default: module.Terms })))

// these paths are fixed by the links the api puts in emails (docs/API.md, "Frontend pages the emails link to").
// the web Caddyfile lists them too (@app), so a new route must be added there as well
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        // pathless, so an error in any page renders inside the layout instead of replacing it
        errorElement: <RouteError />,
        children: [
          { path: '/', element: <Home /> },
          {
            element: <GuestOnly />,
            children: [
              { path: '/sign-up', element: <SignUp /> },
              { path: '/sign-in', element: <SignIn /> },
            ],
          },
          { path: '/verify-email', element: <VerifyEmail /> },
          { path: '/forgot-password', element: <ForgotPassword /> },
          { path: '/reset-password', element: <ResetPassword /> },
          { path: '/confirm-email', element: <ConfirmEmail /> },
          { path: '/privacy', element: <PrivacyPolicy /> },
          { path: '/terms', element: <Terms /> },
          {
            element: <RequireAuth />,
            children: [
              { path: '/dashboard', element: <Dashboard /> },
              {
                element: <RequireAdmin />,
                children: [{ path: '/admin', element: <Admin /> }],
              },
            ],
          },
          ...(DevEmails ? [{ path: '/dev/emails', element: <DevEmails /> }] : []),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

// shared by the browser (main.tsx) and the build-time prerender (entry-server.tsx); the trees must match for hydration
export function App({ router }: { router: ComponentProps<typeof RouterProvider>['router'] }) {
  return (
    <StrictMode>
      <ThemeProvider>
        <LookProvider>
          <LanguageProvider>
            <AuthProvider>
              <RouterProvider router={router} />
              <DesignLabPanel />
            </AuthProvider>
          </LanguageProvider>
        </LookProvider>
      </ThemeProvider>
    </StrictMode>
  )
}
