import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LinkIcon } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useForm } from '@/lib/use-form.ts'
import { useUrlToken } from '@/lib/use-url-token.ts'
import { validateExistingPassword } from '@/lib/validation.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert, PasswordField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

export function VerifyEmail() {
  useDocumentTitle('Verify your email')

  const token = useUrlToken()
  const navigate = useNavigate()
  const { reloadUser } = useAuth()
  // once the api rejects the link it can never work again, so hide the form
  const [deadLink, setDeadLink] = useState<string | null>(null)

  const form = useForm({
    initial: { password: '' },
    validate: { password: validateExistingPassword },
    submit: async values => {
      try {
        await api(`/auth/verify-email/${encodeURIComponent(token!)}`, { method: 'POST', body: { password: values.password } })
      } catch (caught) {
        if(caught instanceof ApiRequestError && caught.status === 401) {
          setDeadLink('That password didn\'t match, so this link has been cancelled to protect the account. Sign up again or sign in to get a new link.')
          return
        }
        if(caught instanceof ApiRequestError && caught.status === 404) {
          setDeadLink('This link has expired or was already used. Sign in and we\'ll email you a new one.')
          return
        }
        throw caught
      }
      // verifying sets the session cookies, so load the user and go straight in
      await reloadUser()
      navigate('/dashboard', { replace: true, state: { welcome: true } })
    },
  })

  if(!token || deadLink) {
    return (
      <AuthShell
        eyebrow="Link expired"
        title="This link doesn't work"
        footer={<><Link to="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link><span className="mx-2">·</span><Link to="/sign-up" className="font-medium text-primary hover:underline">Sign up</Link></>}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <LinkIcon className="size-6" />
          </span>
          <FormAlert kind="error">{deadLink ?? 'The verification link is missing its token. Open the link from your email again.'}</FormAlert>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Last step" title="Verify your email" subtitle="Enter the password you chose when you signed up. It proves the account is yours, and signs you straight in.">
      <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
        {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
        <PasswordField label="Password" autoComplete="current-password" autoFocus error={form.errors.password} {...form.register('password')} />
        <Button type="submit" size="lg" disabled={form.pending} className="w-full">
          {form.pending ? 'Verifying…' : 'Verify and enter'}
        </Button>
      </form>
    </AuthShell>
  )
}
