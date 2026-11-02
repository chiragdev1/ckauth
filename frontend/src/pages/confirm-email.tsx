import { useState } from 'react'
import { Link } from 'react-router'
import { LinkIcon, MailCheck } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { describeError } from '@/lib/validation.ts'
import { useUrlToken } from '@/lib/use-url-token.ts'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'

// the link from "confirm your new email". a button, not an automatic confirm on load: mail scanners open links to check
// them, and one of those would otherwise complete the change before the person ever saw the page
export function ConfirmEmail() {
  useDocumentTitle('Confirm your new email')

  const token = useUrlToken()
  const { user, reloadUser } = useAuth()
  const [state, setState] = useState<{ kind: 'idle' | 'pending' } | { kind: 'done', email: string } | { kind: 'failed', message: string }>({ kind: 'idle' })

  async function handleConfirm() {
    setState({ kind: 'pending' })
    try {
      const { data } = await api<{ email: string }>(`/auth/confirm-email/${encodeURIComponent(token!)}`, { method: 'POST' })
      setState({ kind: 'done', email: data.email })
      // signed in on this device: the header and dashboard should show the new address straight away
      if(user) await reloadUser()
    } catch (error) {
      if(error instanceof ApiRequestError && (error.status === 404 || error.status === 409)) {
        setState({ kind: 'failed', message: error.status === 404 ? 'This link has expired or was already used. Ask for a new one from your dashboard.' : error.message })
        return
      }
      setState({ kind: 'failed', message: describeError(error).formError ?? 'Something went wrong, please try again' })
    }
  }

  const next = <Link to={user ? '/dashboard' : '/sign-in'} className="font-medium text-primary hover:underline">{user ? 'Back to your dashboard' : 'Sign in'}</Link>

  if(state.kind === 'done') {
    return (
      <AuthShell eyebrow="All set" title="Email changed" subtitle={<>Your account now uses <strong className="break-all text-foreground">{state.email}</strong>. Sign in with it from now on.</>} footer={next}>
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success"><MailCheck className="size-7" /></span>
        </div>
      </AuthShell>
    )
  }

  if(!token || state.kind === 'failed') {
    return (
      <AuthShell eyebrow="Link problem" title="This link doesn't work" footer={next}>
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"><LinkIcon className="size-6" /></span>
          <FormAlert kind="error">{state.kind === 'failed' ? state.message : 'The link is missing its token. Open the link from your email again.'}</FormAlert>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Last step" title="Confirm your new email" subtitle="Your account's email changes as soon as you confirm. You'll sign in with the new address from then on.">
      <Button size="lg" className="w-full" onClick={handleConfirm} disabled={state.kind === 'pending'}>
        {state.kind === 'pending' ? 'Confirming…' : 'Confirm new email'}
      </Button>
    </AuthShell>
  )
}
