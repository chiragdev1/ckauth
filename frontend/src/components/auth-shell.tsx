import { useEffect, useRef, type ReactNode } from 'react'
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react'

type AuthShellProps = {
  // small caps line above the title, e.g. "Create an account"
  eyebrow: string
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

// every auth page: the form on a dossier card, with the safety panel beside it on wide screens
export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const shownTitle = useRef(title)

  // a page that swaps views (form → "check your inbox") unmounts the focused button, dropping focus to <body>.
  // a new title means a new view: move focus to it, so screen readers announce it and tab order starts there
  useEffect(() => {
    if(shownTitle.current === title) return
    shownTitle.current = title
    if(document.activeElement === document.body) heading.current?.focus()
  }, [title])

  return (
    <div className="relative flex flex-1">
      <SafetyPanel />
      <div className="relative flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        <div aria-hidden className="bg-wall pointer-events-none absolute inset-0 lg:hidden" />
        <div className="relative w-full max-w-[26rem] animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="dossier rounded-2xl border bg-card/95 p-6 backdrop-blur sm:p-8">
            <p className="eyebrow">{eyebrow}</p>
            <h1 ref={heading} tabIndex={-1} className="font-display mt-2 text-3xl font-semibold outline-none">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

const watchPoints = [
  { icon: MailCheck, text: 'Every new account confirmed by email' },
  { icon: KeyRound, text: 'Passwords kept in a code nobody can read' },
  { icon: ShieldCheck, text: 'Wrong password guesses get blocked' },
]

// the side panel on wide screens: what protects the account, on a quiet grid
function SafetyPanel() {
  return (
    <aside className="relative isolate hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden border-r bg-muted/40 lg:flex">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-70" />

      <p className="p-10 text-sm font-medium text-muted-foreground">Protected by CKAuth</p>

      <div className="space-y-8 p-10">
        <p className="font-display text-[2.3rem] leading-[1.1] font-semibold">
          Your account,<br />
          <span className="text-primary">safe with us.</span>
        </p>
        <ul className="space-y-3.5 text-sm text-muted-foreground">
          {watchPoints.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full border bg-card">
                <Icon className="size-4 text-primary" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
