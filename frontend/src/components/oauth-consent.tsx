import { Check } from 'lucide-react'
import type { User } from '@/lib/api.ts'
import { describeScopes } from '@/lib/oauth-scopes.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { BetaBadge, BetaNote } from '@/components/beta-badge.tsx'
import { Button } from '@/components/ui/button.tsx'

export type ConsentApp = { name: string, host: string }

type ConsentProps = {
  app: ConsentApp
  scopes: string[]
  user: Pick<User, 'firstName' | 'lastName' | 'email'>
  pending?: boolean
  onAllow: () => void
  onDeny: () => void
  onSwitchAccount: () => void
}

// unicode's first-strong isolate: what <bdi> does, for text that has to stay a string (the shell compares titles to
// move focus). an app or person named in a right-to-left script then can't reorder the english around it
const isolate = (text: string) => `⁨${text}⁩`

// the consent screen of sign in with ckauth (docs/OIDC.md, step 4). picked 25 Nov 2026 over a two-tile "handshake" and
// a one-sentence "continue as …" version: it lists each thing shared with the person's own value, so the consent is
// specific (which email, not "your email"), and its "allow" can't be mistaken for a plain sign-in button.
// every piece of content can be at its longest (an 80-character app name with no spaces, a 253-character host,
// a long email, a right-to-left name) and still fit a 320 px screen without scrolling sideways or hiding anything
export function ConsentScreen({ app, scopes, user, ...rest }: ConsentProps) {
  const rows = describeScopes(scopes, user)
  return (
    <AuthShell
      eyebrow="Sign in with CKAuth"
      badge={<BetaBadge />}
      title={`${isolate(app.name)} wants to know who you are`}
      titleClassName="wrap-anywhere"
      subtitle={<AppHost host={app.host} />}
      footer={<ConsentFooter app={app} />}
    >
      <p className="text-sm font-medium">It will see:</p>
      <ul className="mt-3 divide-y rounded-xl border">
        {rows.map(row => (
          <li key={row.scope} className="flex items-start gap-3 px-4 py-3 text-sm">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            {/* label and value share a line while they fit; a long value moves to its own line and wraps there,
                shown in full rather than cut short, since which email or name is shared is the point of the list */}
            <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
              <span>{row.label}</span>
              {row.value && <bdi className="min-w-0 wrap-anywhere text-muted-foreground">{row.value}</bdi>}
            </span>
          </li>
        ))}
      </ul>
      <Decision user={user} {...rest} />
    </AuthShell>
  )
}

// a decision, not a form, so the dialog convention (and google's and github's consent screens): cancel left, allow right,
// as in the avatar cropper. both the same size, so refusing is as easy as agreeing. "cancel" rather than "deny", which
// reads as hostile; the app gets error=access_denied either way. never autofocused: one stray enter would grant consent.
// dom order is the visual order, so tab order matches what people see (wcag 2.4.3)
function Decision({ user, pending, onAllow, onDeny, onSwitchAccount }: Omit<ConsentProps, 'app' | 'scopes'>) {
  return (
    <>
      <div className="mt-7 grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onDeny} disabled={pending}>Cancel</Button>
        <Button onClick={onAllow} disabled={pending}>Allow</Button>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Signed in as <span className="font-medium break-all text-foreground">{user.email}</span>.{' '}
        <button type="button" onClick={onSwitchAccount} className="font-medium text-primary hover:underline">Not you? Switch account</button>
      </p>
    </>
  )
}

// the host is where the person will be sent: shown in full, never truncated, so a look-alike name can't hide it
// (paypal.com.evil.example cut short reads as paypal.com…). it wraps after a dot (<wbr>) or a hyphen, and only
// mid-label (overflow-wrap) when one label alone is wider than the card
function AppHost({ host }: { host: string }) {
  const labels = host.split('.')
  return (
    <span className="font-medium wrap-anywhere text-foreground">
      {labels.map((label, index) => <span key={index}>{label}{index < labels.length - 1 && <>.<wbr /></>}</span>)}
    </span>
  )
}

function ConsentFooter({ app }: { app: ConsentApp }) {
  return (
    <div className="space-y-2 text-left wrap-anywhere">
      <p>You can disconnect <bdi>{app.name}</bdi> any time from Connected apps on your dashboard.</p>
      <BetaNote />
    </div>
  )
}
