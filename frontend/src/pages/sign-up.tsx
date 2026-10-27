import { useState } from 'react'
import { Link } from 'react-router'
import { MailCheck } from 'lucide-react'
import { api } from '@/lib/api.ts'
import { useForm } from '@/lib/use-form.ts'
import { validateEmail, validateFirstName, validateLastName, validateNewPassword } from '@/lib/validation.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert, PasswordField, TextField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

export function SignUp() {
  useDocumentTitle('Create an account')

  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm({
    initial: { firstName: '', lastName: '', email: '', password: '' },
    validate: { firstName: validateFirstName, lastName: validateLastName, email: validateEmail, password: validateNewPassword },
    submit: async values => {
      const lastName = values.lastName.trim()
      await api('/auth/sign-up', {
        method: 'POST',
        body: { firstName: values.firstName.trim(), lastName: lastName || null, email: values.email.trim(), password: values.password },
      })
      setSentTo(values.email.trim())
    },
  })

  // the api answers the same for new and existing emails, so this screen must too
  if(sentTo) {
    return (
      <AuthShell
        eyebrow="Check your email"
        title="Check your inbox"
        subtitle={<>We've sent a message to <strong className="break-all text-foreground">{sentTo}</strong>. Open the link in it to finish signing up.</>}
        footer={<>Wrong address? <button type="button" onClick={() => setSentTo(null)} className="font-medium text-primary hover:underline">Start again</button></>}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-7" />
          </span>
          <FormAlert kind="info">The link expires in 15 minutes. You'll confirm it with the password you just chose, and then you're straight in.</FormAlert>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Free to try"
      title="Create your account"
      subtitle="Join in under a minute. We'll verify your email before anything else."
      footer={<>Already have an account? <Link to="/sign-in" className="font-medium text-primary hover:underline">Sign in</Link></>}
    >
      <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
        {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="First name" autoComplete="given-name" error={form.errors.firstName} {...form.register('firstName')} />
          <TextField label="Last name" optional autoComplete="family-name" error={form.errors.lastName} {...form.register('lastName')} />
        </div>
        <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" error={form.errors.email} {...form.register('email')} />
        <PasswordField label="Password" autoComplete="new-password" showStrength error={form.errors.password} {...form.register('password')} />
        <Button type="submit" size="lg" disabled={form.pending} className="w-full">
          {form.pending ? 'Creating your account…' : 'Create account'}
        </Button>
        {/* a line, not a checkbox: the terms only bind if sign-up says so, and a required tick costs sign-ups.
            new tabs, so reading the terms doesn't throw away what's been typed */}
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Service</Link> and{' '}
          <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </form>
    </AuthShell>
  )
}
