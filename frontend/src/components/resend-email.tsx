import { useEffect, useState, type FormEvent } from 'react'
import { api } from '@/lib/api.ts'
import { describeError, validateEmail } from '@/lib/validation.ts'
import { FormAlert, TextField } from '@/components/form.tsx'
import { Button } from '@/components/ui/button.tsx'

// matches the api's cooldown (RESEND_COOLDOWN_MS): within a minute of the last mail it sends nothing, so the button waits too
const RESEND_COOLDOWN_SECONDS = 60

// "resend the email" wherever someone can get stuck without a working link: after sign-up, an unverified sign-in, and an
// expired link. the api answers the same whether or not the address is waiting, so this always says "sent" too.
// without a known email (an expired link only carries its token) it asks for one
export function ResendEmail({ email, justSent = true }: { email?: string, justSent?: boolean }) {
  const [wait, setWait] = useState(justSent ? RESEND_COOLDOWN_SECONDS : 0)
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | undefined>()
  const [state, setState] = useState<{ kind: 'success' | 'error', text: string } | null>(null)
  const [pending, setPending] = useState(false)

  // counts down from the last send, so the button can't fire a mail the api would skip anyway
  useEffect(() => {
    if(wait <= 0) return
    const timer = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function send(address: string) {
    setPending(true)
    setState(null)
    try {
      await api('/auth/resend-verification', { method: 'POST', body: { email: address } })
      setState({ kind: 'success', text: email ? 'Sent again. The newest link is the one that works.' : `If ${address} is waiting to be confirmed, a new link is on its way.` })
      setWait(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      setState({ kind: 'error', text: describeError(error).formError ?? 'Could not send it, please try again' })
    } finally {
      setPending(false)
    }
  }

  const label = pending ? 'Sending…' : wait > 0 ? `Resend in ${wait}s` : 'Send a new link'

  if(!email) {
    function handleSubmit(event: FormEvent) {
      event.preventDefault()
      const error = validateEmail(typed)
      setTypedError(error)
      if(!error) send(typed.trim())
    }

    return (
      <form onSubmit={handleSubmit} noValidate className="w-full space-y-3 text-left">
        {state && <FormAlert kind={state.kind}>{state.text}</FormAlert>}
        <TextField id="resend-email" label="Your email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={typed} onChange={event => setTyped(event.target.value)} error={typedError} />
        <Button type="submit" disabled={pending || wait > 0} className="w-full">{label}</Button>
      </form>
    )
  }

  return (
    <div className="w-full space-y-3">
      {state && <FormAlert kind={state.kind}>{state.text}</FormAlert>}
      <p className="text-sm text-muted-foreground">
        Nothing yet? Check your spam folder, or{' '}
        <Button variant="link" onClick={() => send(email)} disabled={pending || wait > 0} className="h-auto p-0 align-baseline">
          {pending ? 'sending…' : wait > 0 ? `resend the email in ${wait}s` : 'resend the email'}
        </Button>
      </p>
    </div>
  )
}
