import type { ReactNode } from 'react'
import { ArrowLeftRight, Check } from 'lucide-react'
import type { User } from '@/lib/api.ts'
import { useLook } from '@/lib/design-lab.tsx'
import { describeScopes, type ScopeRow } from '@/lib/oauth-scopes.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { BetaBadge, BetaNote } from '@/components/beta-badge.tsx'
import { Crest } from '@/components/brand.tsx'
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

// the consent screen of sign in with ckauth (docs/OIDC.md, step 4). the shipped design is the card with the list of
// what's shared; the design lab keeps two alternatives, the two-tile "handshake" and the one-sentence version
export function ConsentScreen(props: ConsentProps) {
  const { look } = useLook()
  const rows = describeScopes(props.scopes, props.user)
  if(look === 'consent-handshake') return <HandshakeConsent {...props} rows={rows} />
  if(look === 'consent-sentence') return <SentenceConsent {...props} rows={rows} />
  return <CardConsent {...props} rows={rows} />
}

type ViewProps = ConsentProps & { rows: ScopeRow[] }

function CardConsent({ app, rows, ...rest }: ViewProps) {
  return (
    <AuthShell
      eyebrow="Sign in with CKAuth"
      badge={<BetaBadge />}
      title={`${app.name} wants to know who you are`}
      subtitle={<AppHost host={app.host} />}
      footer={<ConsentFooter app={app} />}
    >
      <p className="text-sm font-medium">It will see:</p>
      <ul className="mt-3 divide-y rounded-xl border">
        {rows.map(row => (
          <li key={row.scope} className="flex items-start gap-3 px-4 py-3 text-sm">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="flex-1">{row.label}</span>
            {row.value && <span className="min-w-0 truncate text-right text-muted-foreground">{row.value}</span>}
          </li>
        ))}
      </ul>
      <Decision {...rest} allowLabel="Allow" />
    </AuthShell>
  )
}

function HandshakeConsent({ app, rows, ...rest }: ViewProps) {
  return (
    <AuthShell
      eyebrow="Sign in with CKAuth"
      badge={<BetaBadge />}
      title={`Connect to ${app.name}?`}
      footer={<ConsentFooter app={app} />}
    >
      {/* top-aligned, and the arrow in a box the size of the tile icons, so it sits at their middle */}
      <div className="flex items-start justify-center gap-2">
        <Tile label="CKAuth"><Crest className="size-7" /></Tile>
        <div className="flex size-14 items-center justify-center"><ArrowLeftRight aria-hidden className="size-5 text-muted-foreground" /></div>
        <Tile label={app.name}>
          <span className="font-display text-xl font-semibold">{app.name.charAt(0).toUpperCase()}</span>
        </Tile>
      </div>
      {/* the host on its own full line, never inside a tile where it would be cut short */}
      <p className="mt-4 text-center text-sm"><AppHost host={app.host} /></p>
      <p className="mt-6 text-sm leading-relaxed">{app.name} wants {listLabels(rows)}.</p>
      <Decision {...rest} allowLabel="Allow" />
    </AuthShell>
  )
}

function SentenceConsent({ app, rows, ...rest }: ViewProps) {
  return (
    <AuthShell
      eyebrow="Sign in with CKAuth"
      badge={<BetaBadge />}
      title={`Continue to ${app.name}?`}
      subtitle={<>{app.name} (<span className="font-medium text-foreground">{app.host}</span>) will see {listLabels(rows)}.</>}
      footer={<ConsentFooter app={app} />}
    >
      <Decision {...rest} allowLabel={`Continue as ${rest.user.firstName}`} stacked />
    </AuthShell>
  )
}

// a decision, not a form, so the dialog convention (and google's and github's consent screens): cancel left, allow right,
// as in the avatar cropper. both the same size, so refusing is as easy as agreeing. "cancel" rather than "deny", which
// reads as hostile; the app gets error=access_denied either way. never autofocused: one stray enter would grant consent.
// dom order is the visual order, so tab order matches what people see (wcag 2.4.3)
function Decision({ user, pending, onAllow, onDeny, onSwitchAccount, allowLabel, stacked }: Omit<ConsentProps, 'app' | 'scopes'> & { allowLabel: string, stacked?: boolean }) {
  const allow = <Button key="allow" onClick={onAllow} disabled={pending} className="min-w-0"><span className="truncate">{allowLabel}</span></Button>
  const cancel = <Button key="cancel" variant="outline" onClick={onDeny} disabled={pending}>Cancel</Button>
  return (
    <>
      {/* a long label like "continue as …" gets full-width rows instead, allow on top (material's order for stacked buttons) */}
      <div className={stacked ? 'mt-7 grid gap-3' : 'mt-7 grid grid-cols-2 gap-3'}>
        {stacked ? [allow, cancel] : [cancel, allow]}
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
    <div className="space-y-2 text-left">
      <p>You can disconnect {app.name} any time from Connected apps on your dashboard.</p>
      <BetaNote />
    </div>
  )
}

// names only, cut to one line: the full name is in the title right above. w-full on the text: in a centred flex column
// a child sizes to its content, so without it truncate has no width to cut at and the text overflows the tile.
// (classes the site already uses: the home page inlines the one stylesheet, and every new utility adds to its budget)
function Tile({ label, children }: { label: string, children: ReactNode }) {
  return (
    <div className="flex w-28 min-w-0 flex-col items-center gap-2 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted">{children}</div>
      <p className="w-full truncate text-sm font-medium" title={label}>{label}</p>
    </div>
  )
}

// "your name and your email address", lowercased, for the sentence versions
function listLabels(rows: ScopeRow[]) {
  const labels = rows.map(row => row.label.charAt(0).toLowerCase() + row.label.slice(1))
  if(labels.length <= 1) return labels[0] ?? 'nothing yet'
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}
