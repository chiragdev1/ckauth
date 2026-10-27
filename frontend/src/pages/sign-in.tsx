import { Link, useLocation, useNavigate } from 'react-router'
import { api, ApiRequestError } from '@/lib/api.ts'
import { useAuth } from '@/lib/auth.tsx'
import { useForm } from '@/lib/use-form.ts'
import { validateEmail, validateExistingPassword } from '@/lib/validation.ts'
import { AuthShell } from '@/components/auth-shell.tsx'
import { FormAlert, PasswordField, TextField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

export function SignIn() {
  useDocumentTitle('Sign in')

  const navigate = useNavigate()
  const location = useLocation()
  const { reloadUser } = useAuth()
  const state = location.state as { notice?: string, from?: string } | null

  const form = useForm({
    initial: { email: '', password: '' },
    validate: { email: validateEmail, password: validateExistingPassword },
    submit: async values => {
      try {
        await api('/auth/sign-in', { method: 'POST', body: { email: values.email.trim(), password: values.password } })
      } catch (caught) {
        // 403 = right password, unverified email; the api has already re-sent the link if the old one expired
        if(caught instanceof ApiRequestError && caught.status === 403) {
          throw new Error('Your email isn\'t verified yet. We\'ve sent a fresh link if the last one expired, so check your inbox.')
        }
        // the api can't say which half was wrong without revealing who has an account, and neither should we
        if(caught instanceof ApiRequestError && caught.status === 401) {
          throw new Error('That email and password don\'t match. Check both and try again.')
        }
        throw caught
      }
      await reloadUser()
      navigate(state?.from ?? '/dashboard', { replace: true })
    },
  })

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Sign in to continue to your dashboard."
      footer={<>New here? <Link to="/sign-up" className="font-medium text-primary hover:underline">Create an account</Link></>}
    >
      <form ref={form.formRef} onSubmit={form.onSubmit} noValidate className="space-y-5">
        {state?.notice && !form.formError && <FormAlert kind="success">{state.notice}</FormAlert>}
        {form.formError && <FormAlert kind="error">{form.formError}</FormAlert>}
        <TextField label="Email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" error={form.errors.email} {...form.register('email')} />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={form.errors.password}
          action={<Link to="/forgot-password" className="text-[0.8rem] font-medium text-primary hover:underline">Forgot password?</Link>}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" disabled={form.pending} className="w-full">
          {form.pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
