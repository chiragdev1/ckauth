import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api.ts'
import { useForm } from '@/lib/use-form.ts'
import { validateEmail } from '@/lib/validation.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert, TextField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

const backToSignIn = (
  <Link to="/sign-in" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
    <ArrowLeft className="size-4" />Back to sign in
  </Link>
)

export function ForgotPassword() {
  useDocumentTitle('Forgot password')

  const [sent, setSent] = useState(false)

  const form = useForm({
    initial: { email: '' },
    validate: { email: validateEmail },
    submit: async values => {
      await api('/auth/forgot-password', { method: 'POST', body: { email: values.email.trim() } })
      setSent(true)
    },
  })

  return (
    <AuthShell
      eyebrow="Forgot password"
      title={sent ? 'Check your inbox' : 'Reset your password'}
      subtitle={sent ? undefined : 'Enter your email and we\'ll send a link to choose a new password.'}
      footer={backToSignIn}
    >
      {sent ? (
        // same message whether or not the account exists, like the api
        <FormAlert kind="success">If an account exists for that email, a reset link is on its way. It expires in 15 minutes.</FormAlert>
      ) : (
        <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
          {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" error={form.errors.email} {...form.register('email')} />
          <Button type="submit" size="lg" disabled={form.pending} className="w-full">
            {form.pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
