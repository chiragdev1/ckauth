import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Camera, ExternalLink, Globe, KeyRound, LogOut, Mail, MonitorSmartphone, Pencil, ShieldCheck, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useForm } from '@/lib/use-form.ts'
import { describeError, validateConfirmation, validateEmail, validateExistingPassword, validateFirstName, validateLastName, validateNewPassword } from '@/lib/validation.ts'
import { describeDevice } from '@/lib/device.ts'
import { timeAgo } from '@/lib/time.ts'
import { FormAlert, PasswordField, TextField, UsernameHint } from '@/components/form.tsx'
import { AvatarLightbox } from '@/components/avatar-lightbox.tsx'
import { AvatarCropper } from '@/components/avatar-cropper.tsx'
import { Spinner } from '@/components/brand.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { cn } from '@/lib/utils.ts'
import { CONTACT_EMAIL, REPO_URL } from './home-copy.ts'

// the photo picked, before cropping. the cropper uploads a small jpeg, so this can be far over the api's 2 MB:
// a photo straight off a phone is fine. the api still checks the real bytes of what's uploaded
const PICKED_MAX_BYTES = 15 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function Dashboard() {
  useDocumentTitle('Dashboard')

  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [welcome, setWelcome] = useState(() => Boolean((location.state as { welcome?: boolean } | null)?.welcome))
  const devices = useSessions()

  // drop the flag from history, so a reload or the back button doesn't welcome them twice
  useEffect(() => {
    if(welcome) navigate(location.pathname, { replace: true, state: null })
  }, [])

  if(!user) return null

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="relative flex-1">
      <div aria-hidden className="bg-wall pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
        {welcome && (
          <div className="dossier flex items-start gap-4 rounded-2xl border border-success/40 bg-success/10 p-5 animate-in fade-in slide-in-from-top-2">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-success" />
            <div className="flex-1">
              <p className="font-display text-lg font-semibold">You're all set</p>
              <p className="text-sm text-muted-foreground">Your email is verified and you're signed in. Welcome, {user.firstName}.</p>
            </div>
            <button type="button" onClick={() => setWelcome(false)} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Your account</p>
            <h1 className="font-display mt-1 text-4xl font-semibold">Hi, {user.firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage your profile and keep your account secure.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.role === 'admin' && (
              <Button asChild variant="outline"><Link to="/admin"><ShieldCheck />Admin</Link></Button>
            )}
            <Button variant="outline" onClick={handleSignOut}><LogOut />Sign out</Button>
          </div>
        </div>

        <ProfileCard deviceCount={devices.sessions?.length ?? null} />
        <ConnectWebsiteCard />
        <SessionsCard devices={devices} />
        <ChangePasswordCard onChanged={devices.load} />
        <DeleteAccountCard />
      </div>
    </div>
  )
}

function ProfileCard({ deviceCount }: { deviceCount: number | null }) {
  const { user, reloadUser } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success', text: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [changingEmail, setChangingEmail] = useState(false)
  const [picked, setPicked] = useState<File | null>(null)
  if(!user) return null

  async function handleRemove() {
    setUploading(true)
    setMessage(null)
    try {
      await api('/auth/avatar', { method: 'DELETE', authed: true })
      await reloadUser()
      setMessage({ kind: 'success', text: 'Profile picture removed' })
    } catch (error) {
      setMessage({ kind: 'error', text: describeError(error).formError ?? 'Could not remove the picture, please try again' })
    } finally {
      setUploading(false)
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if(!file) return

    if(!AVATAR_TYPES.includes(file.type)) {
      return setMessage({ kind: 'error', text: 'Only JPEG, PNG and WebP images are allowed' })
    }
    if(file.size > PICKED_MAX_BYTES) {
      return setMessage({ kind: 'error', text: 'That photo is over 15 MB. Pick a smaller one.' })
    }
    setMessage(null)
    setPicked(file)
  }

  async function upload(blob: Blob) {
    setPicked(null)
    const form = new FormData()
    form.append('avatar', blob, 'avatar.jpg')
    setUploading(true)
    setMessage(null)
    try {
      await api('/auth/upload-avatar', { method: 'POST', body: form, authed: true })
      await reloadUser()
      setMessage({ kind: 'success', text: 'Profile picture updated' })
    } catch (error) {
      setMessage({ kind: 'error', text: describeError(error).formError ?? 'Upload failed, please try again' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="dossier">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="font-display text-lg font-semibold">Profile</CardTitle>
          <CardDescription>Your details and profile picture.</CardDescription>
        </div>
        {!editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil />Edit profile</Button>}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative self-start">
            <AvatarLightbox user={user} className="size-24 text-2xl" />
            <input ref={fileInput} type="file" accept={AVATAR_TYPES.join(',')} className="hidden" onChange={handleFile} />
            <Button
              size="icon-sm"
              variant="secondary"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              aria-label={user.avatarUrl ? 'Change picture' : 'Upload picture'}
              className="absolute -right-1 -bottom-1 rounded-full shadow-md ring-2 ring-card"
            >
              <Camera className={uploading ? 'animate-pulse' : undefined} />
            </Button>
          </div>
          <dl className="grid flex-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Name">{[user.firstName, user.lastName].filter(Boolean).join(' ')}</Detail>
            <Detail label="Email" className="break-all sm:col-span-2 lg:col-span-1">
              {user.email}
              {user.emailVerified && <Badge className="border-success/40 bg-success/10 text-success" variant="outline"><ShieldCheck />Verified</Badge>}
              {!changingEmail && (
                <button type="button" onClick={() => setChangingEmail(true)} className="text-sm font-normal text-primary hover:underline">Change</button>
              )}
            </Detail>
            <Detail label="Member since">{formatDay(user.createdAt)}</Detail>
            <Detail label="Account type">{user.role === 'admin' ? 'Admin' : 'Personal'}</Detail>
            <Detail label="Devices">
              {deviceCount === null ? '–' : `${deviceCount} signed in`}
              <a href="#devices" className="text-primary hover:underline">Manage devices</a>
            </Detail>
          </dl>
        </div>
        {changingEmail && <ChangeEmailForm onDone={sentTo => {
          setChangingEmail(false)
          if(sentTo) setMessage({ kind: 'success', text: `Check ${sentTo} for a link to confirm it. Your email changes once you open it; until then, keep signing in with ${user.email}.` })
        }} />}
        {editing && <EditProfileForm onDone={saved => {
          setEditing(false)
          if(saved) setMessage({ kind: 'success', text: 'Profile saved' })
        }} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-muted-foreground">Profile picture: JPEG, PNG or WebP, up to 15 MB. You'll position it before it's saved.{user.avatarUrl && ' Tap it to see it full size.'}</p>
          {user.avatarUrl && (
            <Button variant="link" size="sm" onClick={handleRemove} disabled={uploading} className="h-auto p-0 text-xs text-destructive">Remove picture</Button>
          )}
        </div>
        {message && <FormAlert kind={message.kind}>{message.text}</FormAlert>}
        {picked && <AvatarCropper file={picked} onCancel={() => setPicked(null)} onCropped={upload} />}
      </CardContent>
    </Card>
  )
}

function Detail({ label, className, children }: { label: string, className?: string, children: ReactNode }) {
  return (
    <div>
      <dt className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn('mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium', className)}>{children}</dd>
    </div>
  )
}

function EditProfileForm({ onDone }: { onDone: (saved: boolean) => void }) {
  const { user, reloadUser } = useAuth()

  const form = useForm({
    initial: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
    validate: { firstName: validateFirstName, lastName: validateLastName },
    submit: async values => {
      // an emptied field means "remove it", which the api takes as null
      const body = { firstName: values.firstName.trim(), lastName: values.lastName.trim() || null }
      await api('/auth/me', { method: 'PATCH', authed: true, body })
      await reloadUser()
      onDone(true)
    },
  })

  return (
    <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-4 rounded-xl border border-border p-4">
      {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" autoComplete="given-name" autoFocus error={form.errors.firstName} {...form.register('firstName')} />
        <TextField label="Last name" optional autoComplete="family-name" error={form.errors.lastName} {...form.register('lastName')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={form.pending}>{form.pending ? 'Saving…' : 'Save changes'}</Button>
        <Button type="button" variant="ghost" onMouseDown={keepFocus} onClick={() => onDone(false)} disabled={form.pending}>Cancel</Button>
      </div>
    </form>
  )
}

// the password again, because moving the account to another inbox is as serious as changing the password
function ChangeEmailForm({ onDone }: { onDone: (sentTo: string | null) => void }) {
  const { user } = useAuth()

  const form = useForm({
    initial: { newEmail: '', password: '' },
    validate: {
      newEmail: value => validateEmail(value) ?? (value.trim().toLowerCase() === user?.email ? 'That\'s already your email' : undefined),
      password: validateExistingPassword,
    },
    submit: async values => {
      await api('/auth/change-email', { method: 'POST', authed: true, body: { newEmail: values.newEmail.trim(), password: values.password } })
      onDone(values.newEmail.trim().toLowerCase())
    },
  })

  return (
    <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-4 rounded-xl border border-border p-4">
      <UsernameHint email={user?.email} />
      {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="New email" type="email" inputMode="email" autoComplete="off" autoFocus error={form.errors.newEmail} {...form.register('newEmail')} />
        <PasswordField label="Your password" autoComplete="current-password" error={form.errors.password} {...form.register('password')} />
      </div>
      <p className="text-xs text-muted-foreground">We'll send a link to the new address, and let your current one know.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={form.pending}>{form.pending ? 'Sending…' : 'Send confirmation link'}</Button>
        <Button type="button" variant="ghost" onMouseDown={keepFocus} onClick={() => onDone(null)} disabled={form.pending}>Cancel</Button>
      </div>
    </form>
  )
}

type Session = { id: string, userAgent: string | null, ipAddress: string | null, createdAt: string, lastUsedAt: string, current: boolean }

// loaded once for the page: the profile shows the count, the devices card the list
function useSessions() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api<Session[]>('/auth/sessions', { authed: true })
      setSessions(data)
      setError(null)
    } catch (caught) {
      setError(describeError(caught).formError ?? 'Could not load your devices')
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { sessions, error, setError, load }
}

// every device signed in to this account; ending one signs it out at once, since each access token names its session
function SessionsCard({ devices }: { devices: ReturnType<typeof useSessions> }) {
  const { sessions, error, setError, load } = devices
  const [busy, setBusy] = useState<string | null>(null)

  // one session by id, or every other one in a single request
  async function revoke(target: string) {
    setBusy(target)
    try {
      await api(target === 'others' ? '/auth/sessions' : `/auth/sessions/${target}`, { method: 'DELETE', authed: true })
      await load()
    } catch (caught) {
      setError(describeError(caught).formError ?? 'Could not sign that device out')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const others = sessions?.filter(session => !session.current) ?? []
  const list = { sessions: sessions ?? [], busy, revoke }

  return (
    <Card id="devices" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2 text-lg font-semibold"><MonitorSmartphone className="size-5 text-primary" />Manage devices</CardTitle>
        <CardDescription>Everywhere you're signed in. Don't recognise one? Sign it out, then change your password.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        {error && <FormAlert kind="error">{error}</FormAlert>}
        {!sessions && !error && <Spinner />}
        {sessions && <RecentSessions {...list} />}
        {others.length > 1 && (
          <Button variant="outline" onClick={() => revoke('others')} disabled={busy !== null}>
            <LogOut />{busy === 'others' ? 'Signing out…' : `Sign out the other ${others.length} devices`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

type SessionListProps = { sessions: Session[], busy: string | null, revoke: (target: string) => void }

// how many rows show before "Show all": this device plus the most recently used others
const RECENT_SESSIONS = 4

// this device first, then the most recently used, with the rest one click away
function RecentSessions({ sessions, busy, revoke }: SessionListProps) {
  const [showAll, setShowAll] = useState(false)
  // the api sorts by last use, so moving the current one to the top keeps the rest in that order
  const ordered = [...sessions.filter(session => session.current), ...sessions.filter(session => !session.current)]
  const shown = showAll ? ordered : ordered.slice(0, RECENT_SESSIONS)

  return (
    <>
      <ul className="divide-y divide-border">
        {shown.map(session => (
          <li key={session.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <SessionDetails session={session} />
            {!session.current && <SignOutButton session={session} busy={busy} onClick={() => revoke(session.id)} />}
          </li>
        ))}
      </ul>
      {ordered.length > RECENT_SESSIONS && (
        <Button variant="link" className="h-auto p-0" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${ordered.length} devices`}
        </Button>
      )}
    </>
  )
}

function SessionDetails({ session }: { session: Session }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {describeDevice(session.userAgent)}
        {session.current && <Badge variant="outline" className="border-success/40 bg-success/10 text-foreground">This device</Badge>}
      </p>
      <p className="text-xs text-muted-foreground">
        {session.ipAddress ?? 'Unknown IP'} · {session.current ? 'active now' : <>active <When value={session.lastUsedAt} /></>} · signed in <When value={session.createdAt} />
      </p>
    </div>
  )
}

// every row's button says "Sign out", so the label names the device for screen readers; shrink-0 keeps it on the row on phones
function SignOutButton({ session, busy, onClick }: { session: Session, busy: string | null, onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="shrink-0" onClick={onClick} disabled={busy !== null} aria-label={`Sign out ${describeDevice(session.userAgent)}, active ${timeAgo(session.lastUsedAt)}`}>
      {busy === session.id ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}

// a cancel button's press would blur the focused field first, which shows its "required" error and moves the button
// down before the click lands, so the click misses. keeping focus where it is avoids that; keyboard users are unaffected
function keepFocus(event: MouseEvent) {
  event.preventDefault()
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

// "2 hours ago", with the exact time on hover and for assistive tech that reads <time>
function When({ value }: { value: string }) {
  const exact = new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return <time dateTime={value} title={exact}>{timeAgo(value)}</time>
}

// two steps and the password, since there is no undo. admins are removed on the server, so they get an explanation instead
function DeleteAccountCard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const form = useForm({
    initial: { password: '' },
    validate: { password: validateExistingPassword },
    submit: async values => {
      await api('/auth/me', { method: 'DELETE', authed: true, body: { password: values.password } })
      // leave the dashboard first: dropping the user while still on it makes RequireAuth redirect to sign-in, which would
      // win over this navigation. the api already cleared the cookies; signOut drops the local user too
      navigate('/', { replace: true, state: { notice: 'account-deleted' } })
      await signOut()
    },
  })

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="font-display text-lg font-semibold">Delete account</CardTitle>
        <CardDescription>Removes your profile, photo and every session for good. Backups forget it within 14 days.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        {user?.role === 'admin' ? (
          <p className="text-sm text-muted-foreground">Admin accounts can only be deleted on the server, so a stolen session can't remove an admin.</p>
        ) : !confirming ? (
          <Button variant="outline" onClick={() => setConfirming(true)} className="border-destructive/40 text-destructive hover:text-destructive"><Trash2 />Delete my account</Button>
        ) : (
          <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="max-w-md space-y-4">
            <UsernameHint email={user?.email} />
            {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
            <PasswordField label="Type your password to confirm" autoComplete="current-password" autoFocus error={form.errors.password} {...form.register('password')} />
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={form.pending}>{form.pending ? 'Deleting…' : 'Delete forever'}</Button>
              <Button type="button" variant="ghost" onMouseDown={keepFocus} onClick={() => setConfirming(false)} disabled={form.pending}>Cancel</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// the landing page sells ckauth to people with a website, so the dashboard says plainly what connecting one takes today
// and what's coming, instead of leaving a new sign-up wondering where the rest is (home-copy.ts, faq "do I need to code?")
function ConnectWebsiteCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="size-5 text-primary" />
          <CardTitle className="font-display text-lg font-semibold">Connect your website</CardTitle>
          <Badge variant="outline" className="border-brass/40 bg-brass/10 text-foreground">Coming soon</Badge>
        </div>
        <CardDescription>Soon you'll add CKAuth to your own website from here, without writing code.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Until then, CKAuth is open source: a developer can set it up on any website by following its README.
          The sign-in you just used is exactly what your users would see.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href={REPO_URL} target="_blank" rel="noreferrer">Read the setup guide<ExternalLink /><span className="sr-only"> (opens in a new tab)</span></a>
          </Button>
          <Button asChild variant="ghost">
            <a href={`mailto:${CONTACT_EMAIL}?subject=Connecting my website to CKAuth`}><Mail />Tell us what you need</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// a button until it's needed, so the dashboard isn't a wall of password fields; the form opens in place
function ChangePasswordCard({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  const form = useForm({
    initial: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: {
      currentPassword: validateExistingPassword,
      newPassword: (value, values) => validateNewPassword(value) ?? (value === values.currentPassword ? 'New password must be different from the current one' : undefined),
      confirmPassword: (value, values) => validateConfirmation(value, values.newPassword),
    },
    submit: async values => {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword }, authed: true })
      form.reset()
      setOpen(false)
      setDone(true)
      // every other device was just signed out, so the device list has changed
      onChanged()
    },
  })

  function handleClose() {
    form.reset()
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="font-display text-lg font-semibold">Password</CardTitle>
          <CardDescription>Changing it signs out your other devices. This one stays signed in.</CardDescription>
        </div>
        {!open && <Button variant="outline" size="sm" onClick={() => { setDone(false); setOpen(true) }}><KeyRound />Change password</Button>}
      </CardHeader>
      {(open || done) && <Separator />}
      {done && !open && (
        <CardContent>
          <FormAlert kind="success">Password changed. Every other device has been signed out.</FormAlert>
        </CardContent>
      )}
      {open && (
        <CardContent>
          <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="max-w-md space-y-5">
            <UsernameHint email={user?.email} />
            {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
            <PasswordField label="Current password" autoComplete="current-password" autoFocus error={form.errors.currentPassword} {...form.register('currentPassword')} />
            <PasswordField label="New password" autoComplete="new-password" showStrength error={form.errors.newPassword} {...form.register('newPassword')} />
            <PasswordField label="Confirm new password" autoComplete="new-password" error={form.errors.confirmPassword} {...form.register('confirmPassword')} />
            <div className="flex gap-2">
              <Button type="submit" disabled={form.pending}>{form.pending ? 'Updating…' : 'Update password'}</Button>
              <Button type="button" variant="ghost" onMouseDown={keepFocus} onClick={handleClose} disabled={form.pending}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  )
}
