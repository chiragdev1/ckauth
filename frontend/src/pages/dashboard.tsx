import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Camera, ExternalLink, Globe, LogOut, Mail, ShieldCheck, X } from 'lucide-react'
import { api } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useForm } from '@/lib/use-form.ts'
import { describeError, validateConfirmation, validateExistingPassword, validateNewPassword } from '@/lib/validation.ts'
import { FormAlert, PasswordField } from '@/components/form.tsx'
import { UserAvatar } from '@/components/user-avatar.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { CONTACT_EMAIL, REPO_URL } from './home-copy.ts'

// mirrors the api's limits so obvious mistakes fail instantly; the api still checks the real bytes
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function Dashboard() {
  useDocumentTitle('Dashboard')

  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [welcome, setWelcome] = useState(() => Boolean((location.state as { welcome?: boolean } | null)?.welcome))

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
          <Button variant="outline" onClick={handleSignOut}><LogOut />Sign out</Button>
        </div>

        <ProfileCard />
        <ConnectWebsiteCard />
        <ChangePasswordCard />
      </div>
    </div>
  )
}

function ProfileCard() {
  const { user, reloadUser } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success', text: string } | null>(null)
  if(!user) return null

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if(!file) return

    if(!AVATAR_TYPES.includes(file.type)) {
      return setMessage({ kind: 'error', text: 'Only JPEG, PNG and WebP images are allowed' })
    }
    if(file.size > AVATAR_MAX_BYTES) {
      return setMessage({ kind: 'error', text: 'Avatar must be at most 2 MB' })
    }

    const form = new FormData()
    form.append('avatar', file)
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
      <CardHeader>
        <CardTitle className="font-display text-lg font-semibold">Profile</CardTitle>
        <CardDescription>Your name, email and profile picture.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative self-start">
            <UserAvatar user={user} className="size-24 text-2xl" />
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
          <dl className="grid flex-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">Name</dt>
              <dd className="mt-1 font-medium">{[user.firstName, user.lastName].filter(Boolean).join(' ')}</dd>
            </div>
            <div>
              <dt className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">Email</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium break-all">
                {user.email}
                {user.emailVerified && <Badge className="border-success/40 bg-success/10 text-success" variant="outline"><ShieldCheck />Verified</Badge>}
              </dd>
            </div>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">Profile picture: JPEG, PNG or WebP, up to 2 MB.</p>
        {message && <FormAlert kind={message.kind}>{message.text}</FormAlert>}
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

function ChangePasswordCard() {
  const { user } = useAuth()
  const [done, setDone] = useState(false)

  const form = useForm({
    initial: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: {
      currentPassword: validateExistingPassword,
      newPassword: (value, values) => validateNewPassword(value) ?? (value === values.currentPassword ? 'New password must be different from the current one' : undefined),
      confirmPassword: (value, values) => validateConfirmation(value, values.newPassword),
    },
    submit: async values => {
      setDone(false)
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: values.currentPassword, newPassword: values.newPassword }, authed: true })
      setDone(true)
      form.reset()
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg font-semibold">Change password</CardTitle>
        <CardDescription>Other devices will be signed out. This one stays signed in.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="max-w-md space-y-5">
          {/* password managers file the new password under this username; without it they guess, or ask */}
          <input type="email" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
          {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
          {done && !form.formError && <FormAlert kind="success">Password changed. Every other session has been signed out.</FormAlert>}
          <PasswordField label="Current password" autoComplete="current-password" error={form.errors.currentPassword} {...form.register('currentPassword')} />
          <PasswordField label="New password" autoComplete="new-password" showStrength error={form.errors.newPassword} {...form.register('newPassword')} />
          <PasswordField label="Confirm new password" autoComplete="new-password" error={form.errors.confirmPassword} {...form.register('confirmPassword')} />
          <Button type="submit" disabled={form.pending}>
            {form.pending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
