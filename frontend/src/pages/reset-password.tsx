import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useForm } from '@/lib/use-form.ts'
import { useUrlToken } from '@/lib/use-url-token.ts'
import { validateConfirmation, validateNewPassword } from '@/lib/validation.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert, PasswordField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

const requestNewLink = <Link to="/forgot-password" className="font-medium text-primary hover:underline">Request a new link</Link>

export function ResetPassword() {
  // an admin invite links here too (with &invite=1): same api call, but the person is choosing a first password, not resetting one.
  // read once, like the token: useUrlToken clears the query string from the address bar after the first render
  const [invite] = useState(() => new URLSearchParams(window.location.search).get('invite') === '1')
  useDocumentTitle(invite ? 'Choose your password' : 'Reset your password')

  const token = useUrlToken()
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const form = useForm({
    initial: { newPassword: '', confirmPassword: '' },
    validate: {
      newPassword: validateNewPassword,
      confirmPassword: (value, values) => validateConfirmation(value, values.newPassword),
    },
    submit: async values => {
      await api(`/auth/reset-password/${encodeURIComponent(token!)}`, { method: 'POST', body: { newPassword: values.newPassword } })
      // the reset revoked every session; clear this browser's cookies too
      await signOut()
      navigate('/sign-in', { replace: true, state: { notice: invite ? 'Your account is ready. Sign in with your new password.' : 'Password updated. Sign in with your new password.' } })
    },
  })

  if(!token) {
    return (
      <AuthShell eyebrow="Link expired" title="This link doesn't work" footer={requestNewLink}>
        <FormAlert kind="error">The reset link is missing its token. Open the link from your email again.</FormAlert>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow={invite ? 'Welcome' : 'Reset password'}
      title={invite ? 'Choose your password' : 'Choose a new password'}
      subtitle={invite ? 'This finishes setting up your account and confirms your email.' : "You'll be signed out on every device, including this one."}
      footer={requestNewLink}
    >
      <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
        {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
        <PasswordField label="New password" autoComplete="new-password" showStrength autoFocus error={form.errors.newPassword} {...form.register('newPassword')} />
        <PasswordField label="Confirm new password" autoComplete="new-password" error={form.errors.confirmPassword} {...form.register('confirmPassword')} />
        <Button type="submit" size="lg" disabled={form.pending} className="w-full">
          {form.pending ? 'Saving…' : invite ? 'Set password' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  )
}
