import { AtSign, History, KeyRound, LogIn, MailCheck, RefreshCw, ShieldAlert, ShieldCheck, ShieldX, Trash2, UserPlus, UserX, X, type LucideIcon } from 'lucide-react'
import { activityActions, type ActivityAction, type ActivityEvent, type useActivity } from '@/lib/admin.ts'
import { timeAgo } from '@/lib/time.ts'
import { cn } from '@/lib/utils.ts'
import { FormAlert } from '@/components/form.tsx'
import { Spinner } from '@/components/brand.tsx'
import { Pager } from '@/components/pager.tsx'
import { Button } from '@/components/ui/button.tsx'

type Activity = ReturnType<typeof useActivity>
type Tone = 'neutral' | 'good' | 'warn' | 'danger'
// label is the first name; the email is only a tooltip, except for a deleted account, where it's all that's left
type Person = { id: string | null, label: string, email?: string | undefined }
type PickUser = (person: Person) => void

// tinted backgrounds with full-strength text, never faded text, so every tone keeps AA contrast
const toneClasses: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  good: 'border-success/40 bg-success/10 text-foreground',
  warn: 'border-brass/40 bg-brass/10 text-foreground',
  danger: 'border-destructive/40 bg-destructive/10 text-foreground',
}

type Described = { tone: Tone, Icon: LucideIcon, actor: Person | null, verb: string, target: Person | null, extra?: string }

// one sentence per event: "<actor> <verb> <target><extra>".
// focusId is the person the log is filtered to: their name would repeat on every row, so it's left out wherever
// they're the only person in the sentence
function describeEvent(event: ActivityEvent, focusId: string | null): Described {
  const described = describeAction(event)
  const isFocus = (person: Person | null) => !!person?.id && person.id === focusId

  // "Priya signed in" → "Signed in"
  if(isFocus(described.actor) && (!described.target || isFocus(described.target))) {
    return { ...described, actor: null, target: null, verb: capitalise(described.verb) }
  }
  // "Wrong password at sign-in for Sara" → "Wrong password at sign-in"
  if(!described.actor && isFocus(described.target)) {
    return { ...described, target: null, verb: described.verb.replace(/ for$/, '') }
  }
  return described
}

function describeAction(event: ActivityEvent): Described {
  const detail = (key: string) => (event.details?.[key] === undefined ? undefined : String(event.details[key]))
  // a live account by first name; a deleted one's join is null, so its email comes from the event itself
  const person = (id: string | null, firstName: string | null, email: string | null, gone: string): Person => email
    ? { id, label: firstName ?? email, email }
    : { id: null, label: detail('email') ?? gone }
  const actor: Person = event.source === 'cli'
    ? { id: null, label: 'The server' }
    : person(event.actorId, event.actorFirstName, event.actorEmail, 'A deleted account')
  const target = person(event.targetId, event.targetFirstName, event.targetEmail, 'a deleted account')

  switch(event.action) {
    case 'sign_in': return { tone: 'neutral', Icon: LogIn, actor, verb: event.details?.newDevice ? 'signed in on a new device' : 'signed in', target: null }
    case 'sign_in_failed': return { tone: 'warn', Icon: ShieldAlert, actor: null, verb: 'Wrong password at sign-in for', target }
    case 'email_verified': return { tone: 'good', Icon: MailCheck, actor, verb: 'verified their email', target: null }
    case 'password_changed': return { tone: 'neutral', Icon: KeyRound, actor, verb: 'changed their password', target: null }
    case 'password_reset': return { tone: 'neutral', Icon: KeyRound, actor, verb: event.details?.firstPassword ? 'set their password from an invite' : 'reset their password by email', target: null }
    // an email change is how an account takeover locks the owner out, so it stands out
    case 'email_changed': return { tone: 'warn', Icon: AtSign, actor, verb: 'changed their email', target: null, extra: detail('previousEmail') ? ` (was ${detail('previousEmail')})` : '' }
    case 'account_deleted': return { tone: 'danger', Icon: UserX, actor, verb: 'deleted their own account', target: null }
    case 'admin_reauth': return { tone: 'neutral', Icon: ShieldCheck, actor, verb: 'confirmed their admin password', target: null }
    case 'admin_reauth_failed': return { tone: 'warn', Icon: ShieldX, actor, verb: 'entered a wrong admin password', target: null }
    case 'user_invited': return { tone: 'good', Icon: UserPlus, actor, verb: 'invited', target }
    case 'user_deleted': return { tone: 'danger', Icon: Trash2, actor, verb: 'deleted', target }
    case 'role_changed': return { tone: 'warn', Icon: ShieldCheck, actor, verb: 'made', target, extra: detail('role') === 'admin' ? ' an admin' : ' a regular user' }
    // an action added to the api before the frontend knows its wording
    default: return { tone: 'neutral', Icon: History, actor, verb: String(event.action).replaceAll('_', ' '), target: null }
  }
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// a person who still has an account filters the log to them; a deleted one is plain text
function PersonName({ person, onPick }: { person: Person, onPick: PickUser }) {
  if(!person.id) return <span className="font-medium" title={person.email}>{person.label}</span>
  return (
    <button type="button" onClick={() => onPick(person)} className="font-medium underline underline-offset-4 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" title={person.email}>
      {person.label}
    </button>
  )
}

function Sentence({ event, focusId, onPick }: { event: ActivityEvent, focusId: string | null, onPick: PickUser }) {
  const { actor, verb, target, extra } = describeEvent(event, focusId)
  return (
    <span>
      {actor && <><PersonName person={actor} onPick={onPick} />{' '}</>}
      {verb}
      {target && <>{' '}<PersonName person={target} onPick={onPick} /></>}
      {extra}
    </span>
  )
}

function When({ value }: { value: string }) {
  return <time dateTime={value} title={new Date(value).toLocaleString()}>{timeAgo(value)}</time>
}

function EventPill({ event, tone, Icon }: { event: ActivityEvent, tone: Tone, Icon: LucideIcon }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', toneClasses[tone])}>
      <Icon aria-hidden className="size-3" />{activityActions[event.action] ?? event.action}
    </span>
  )
}

export function ActivitySection({ activity }: { activity: Activity }) {
  // the chip shows the email: unlike a row, it has to say unambiguously whose log this is
  const pick: PickUser = person => person.id && activity.setFilter({ user: { id: person.id, label: person.email ?? person.label } })
  const focusId = activity.filter.user?.id ?? null

  return (
    <section id="activity" aria-labelledby="activity-heading" className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-heading" className="font-display flex items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-primary" />Activity
          <span className="text-sm font-normal text-muted-foreground tabular-nums">({activity.total})</span>
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {activity.filter.user && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-sm">
              <span className="break-all">{activity.filter.user.label}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => activity.setFilter({ user: null })} aria-label={`Stop filtering by ${activity.filter.user.label}`}><X /></Button>
            </span>
          )}
          <select
            value={activity.filter.action ?? ''}
            onChange={event => activity.setFilter({ action: (event.target.value || null) as ActivityAction | null })}
            aria-label="Show one kind of event"
            className="h-9 flex-1 rounded-md border border-input bg-card px-3 text-sm sm:flex-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option value="">Every event</option>
            {Object.entries(activityActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={activity.reload} disabled={activity.loading} aria-label="Refresh activity">
            <RefreshCw className={cn(activity.loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {activity.error ? <FormAlert kind="error">{activity.error}</FormAlert>
        : activity.loading && activity.events.length === 0 ? <Spinner />
        : activity.events.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded{activity.filter.action || activity.filter.user ? ' that matches' : ' yet'}.</p>
        : <ActivityTable events={activity.events} focusId={focusId} onPick={pick} />}

      <Pager data={activity} label="Activity pages" />
    </section>
  )
}

// Table: dense rows for scanning many events; scrolls inside its own box on phones, never the page
function ActivityTable({ events, focusId, onPick }: { events: ActivityEvent[], focusId: string | null, onPick: PickUser }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-160 text-left text-sm">
        <thead className="border-b border-border text-xs tracking-[0.15em] text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">When</th>
            <th scope="col" className="px-4 py-3 font-medium">Event</th>
            <th scope="col" className="px-4 py-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map(event => {
            const { tone, Icon } = describeEvent(event, focusId)
            return (
              <tr key={event.id}>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground"><When value={event.createdAt} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <EventPill event={event} tone={tone} Icon={Icon} />
                </td>
                <td className="px-4 py-3"><Sentence event={event} focusId={focusId} onPick={onPick} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
