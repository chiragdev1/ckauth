import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { ChevronLeft, ChevronRight, KeyRound, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useAdminData, type AdminStats, type AdminUser } from '@/lib/admin.ts'
import { useForm } from '@/lib/use-form.ts'
import { describeError, validateEmail, validateExistingPassword, validateFirstName, validateLastName } from '@/lib/validation.ts'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { cn } from '@/lib/utils.ts'
import { FormAlert, PasswordField, TextField } from '@/components/form.tsx'
import { Spinner } from '@/components/brand.tsx'
import { UserAvatar } from '@/components/user-avatar.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'

type AdminData = ReturnType<typeof useAdminData>

// one card per user, with "invite a user" as the first card in the grid
export function Admin() {
  useDocumentTitle('Admin')
  const data = useAdminData()

  return (
    <ReauthProvider>
      <div className="relative flex-1">
        <div aria-hidden className="bg-wall pointer-events-none absolute inset-x-0 top-0 h-72" />
        <div className="relative mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="font-display mt-1 text-4xl font-semibold">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">Everyone with a CKAuth account. Admins are managed on the server.</p>
          </div>
          <StatTiles stats={data.stats} />
          <UsersSection data={data} />
        </div>
      </div>
    </ReauthProvider>
  )
}

function UsersSection({ data }: { data: AdminData }) {
  const [inviting, setInviting] = useState(false)

  return (
    <>
      <ListHeading data={data} />
      <ListState data={data} always={inviting}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li className={cn(inviting && 'sm:col-span-2 lg:col-span-3')}>
            {inviting ? (
              <Card className="dossier">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="font-display text-lg font-semibold">Invite a user</CardTitle>
                    <CardDescription>They get an email to choose their own password. Choosing it also confirms their email.</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setInviting(false)} aria-label="Close"><X /></Button>
                </CardHeader>
                <CardContent>
                  <InviteUserForm onInvited={data.reload} />
                </CardContent>
              </Card>
            ) : (
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="flex h-full min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <UserPlus className="size-6" />Invite a user
              </button>
            )}
          </li>
          {data.users.map(user => (
            <li key={user.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={user} className="size-12" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{fullName(user)}</p>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <UserBadges user={user} />
                      <span className="text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</span>
                    </div>
                    <DeleteUserButton user={user} onDeleted={data.reload} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </ListState>
      <Pager data={data} />
    </>
  )
}

// ---- sudo mode: an admin write that answers REAUTH_REQUIRED asks for the password once, then runs again

class ReauthCancelled extends Error {
  constructor() {
    super('Nothing was changed: your password wasn\'t confirmed.')
  }
}

type RunWithReauth = <T>(action: () => Promise<T>) => Promise<T>

const ReauthContext = createContext<RunWithReauth>(action => action())

function ReauthProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ resolve: () => void, reject: (error: Error) => void } | null>(null)

  const runWithReauth = useCallback<RunWithReauth>(async action => {
    try {
      return await action()
    } catch (error) {
      if(!(error instanceof ApiRequestError && error.code === 'REAUTH_REQUIRED')) throw error
      await new Promise<void>((resolve, reject) => setPending({ resolve, reject }))
      return action()
    }
  }, [])

  return (
    <ReauthContext.Provider value={runWithReauth}>
      {children}
      {pending && (
        <ReauthDialog
          onConfirmed={() => { pending.resolve(); setPending(null) }}
          onCancel={() => { pending.reject(new ReauthCancelled()); setPending(null) }}
        />
      )}
    </ReauthContext.Provider>
  )
}

function ReauthDialog({ onConfirmed, onCancel }: { onConfirmed: () => void, onCancel: () => void }) {
  const { user } = useAuth()
  const form = useForm({
    initial: { password: '' },
    validate: { password: validateExistingPassword },
    submit: async values => {
      await api('/admin/reauth', { method: 'POST', body: { password: values.password }, authed: true })
      onConfirmed()
    },
  })

  // a radix dialog: focus stays inside while it's open, the page behind doesn't scroll, escape or a click outside cancels,
  // and focus goes back to the button that opened it
  return (
    <Dialog.Root open onOpenChange={open => { if(!open && !form.pending) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 focus:outline-none">
          <Card className="dossier">
            <CardHeader>
              <Dialog.Title asChild>
                <CardTitle className="font-display flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-primary" />Confirm it's you</CardTitle>
              </Dialog.Title>
              <Dialog.Description asChild>
                <CardDescription>Inviting and deleting users needs your password. It stays confirmed for 15 minutes.</CardDescription>
              </Dialog.Description>
            </CardHeader>
            <CardContent>
              <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-4">
                <input type="email" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
                {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
                <PasswordField label="Your password" autoComplete="current-password" autoFocus error={form.errors.password} {...form.register('password')} />
                <div className="flex gap-2">
                  <Button type="submit" disabled={form.pending}>{form.pending ? 'Checking…' : 'Confirm'}</Button>
                  <Button type="button" variant="ghost" onClick={onCancel} disabled={form.pending}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StatTiles({ stats }: { stats: AdminStats | null }) {
  const verifiedShare = stats && stats.totalUsers > 0 ? Math.round(stats.verifiedUsers / stats.totalUsers * 100) : 0
  const tiles = [
    { label: 'Total users', value: stats?.totalUsers, note: 'All accounts' },
    { label: 'Verified', value: stats?.verifiedUsers, note: `${verifiedShare}% of users` },
    { label: 'New this week', value: stats?.newThisWeek, note: 'Last 7 days' },
    { label: 'Admins', value: stats?.admins, note: 'Set on the server' },
  ]

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map(tile => (
        <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
          <dt className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{tile.label}</dt>
          <dd className="font-display mt-2 text-3xl font-semibold tabular-nums">{tile.value ?? '–'}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{tile.note}</dd>
        </div>
      ))}
    </dl>
  )
}

function ListHeading({ data }: { data: AdminData }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
        <Users className="size-5 text-primary" />{data.searching ? 'Matching users' : 'All users'}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">({data.total})</span>
      </h2>
      {/* its own full-width row on phones, so the placeholder isn't cut off */}
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="relative flex-1 sm:w-64 sm:flex-none">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={data.search}
            onChange={event => data.setSearch(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search users by name or email"
            maxLength={100}
            className="h-9 bg-card pl-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={data.reload} disabled={data.loading} aria-label="Refresh">
          <RefreshCw className={cn(data.loading && 'animate-spin')} />
        </Button>
      </div>
    </div>
  )
}

// loading, error and empty states; `always` keeps the grid on screen while the invite form is open, even with no users
function ListState({ data, always, children }: { data: AdminData, always?: boolean, children: ReactNode }) {
  if(data.error) return <FormAlert kind="error">{data.error}</FormAlert>
  // only the first load shows a spinner; a refresh keeps the old rows on screen until the new ones arrive
  if(data.loading && data.users.length === 0 && !data.searching) return <Spinner />
  if(data.users.length === 0 && data.searching && !always) return <p className="py-8 text-center text-sm text-muted-foreground">No users match "{data.search.trim()}".</p>
  if(data.users.length === 0 && !always) return <p className="py-8 text-center text-sm text-muted-foreground">No users yet.</p>
  return <>{children}</>
}

function UserBadges({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.role === 'admin' && <Badge className="border-primary/40 bg-primary/10 text-foreground" variant="outline"><ShieldCheck />Admin</Badge>}
      {user.emailVerified
        ? <Badge className="border-success/40 bg-success/10 text-foreground" variant="outline">Verified</Badge>
        : <Badge variant="outline">Unverified</Badge>}
    </div>
  )
}

// two clicks to delete, since there is no undo; admins (including you) can't be deleted here, the api refuses too
function DeleteUserButton({ user, onDeleted }: { user: AdminUser, onDeleted: () => void }) {
  const { user: me } = useAuth()
  const runWithReauth = useContext(ReauthContext)
  const [state, setState] = useState<'idle' | 'confirm' | 'pending'>('idle')
  const [error, setError] = useState<string | null>(null)

  if(user.role === 'admin' || user.id === me?.id) {
    return <span className="text-xs text-muted-foreground">{user.id === me?.id ? 'You' : 'Protected'}</span>
  }

  async function handleDelete() {
    setState('pending')
    setError(null)
    try {
      await runWithReauth(() => api(`/admin/users/${user.id}`, { method: 'DELETE', authed: true }))
      onDeleted()
    } catch (caught) {
      setError(describeError(caught).formError ?? 'Could not delete this user')
      setState('idle')
    }
  }

  if(state === 'idle') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setState('confirm')} aria-label={`Delete ${user.email}`} className="text-destructive hover:text-destructive">
          <Trash2 />Delete
        </Button>
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={state === 'pending'} aria-label={`Confirm deleting ${user.email}`}>
        {state === 'pending' ? 'Deleting…' : 'Confirm'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setState('idle')} disabled={state === 'pending'}>Cancel</Button>
    </span>
  )
}

function InviteUserForm({ onInvited }: { onInvited: () => void }) {
  const runWithReauth = useContext(ReauthContext)
  const [invited, setInvited] = useState<string | null>(null)

  const form = useForm({
    initial: { firstName: '', lastName: '', email: '' },
    validate: {
      firstName: validateFirstName,
      lastName: validateLastName,
      email: validateEmail,
    },
    submit: async values => {
      setInvited(null)
      const body = { firstName: values.firstName, lastName: values.lastName || null, email: values.email }
      await runWithReauth(() => api('/admin/users', { method: 'POST', authed: true, body }))
      setInvited(values.email.trim())
      form.reset()
      onInvited()
    },
  })

  return (
    <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
      {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
      {invited && !form.formError && <FormAlert kind="success">Invite sent to {invited}. The link works for 72 hours.</FormAlert>}
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField label="First name" autoComplete="off" error={form.errors.firstName} {...form.register('firstName')} />
        <TextField label="Last name" optional autoComplete="off" error={form.errors.lastName} {...form.register('lastName')} />
        <TextField label="Email" type="email" inputMode="email" autoComplete="off" error={form.errors.email} {...form.register('email')} />
      </div>
      <Button type="submit" disabled={form.pending}>
        {form.pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  )
}

function Pager({ data }: { data: AdminData }) {
  if(data.totalPages <= 1) return null

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
      <Button variant="outline" size="sm" onClick={() => data.setPage(data.page - 1)} disabled={data.page <= 1 || data.loading}>
        <ChevronLeft />Previous
      </Button>
      <span className="text-muted-foreground tabular-nums">Page {data.page} of {data.totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => data.setPage(data.page + 1)} disabled={data.page >= data.totalPages || data.loading}>
        Next<ChevronRight />
      </Button>
    </nav>
  )
}

function fullName(user: AdminUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ')
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

