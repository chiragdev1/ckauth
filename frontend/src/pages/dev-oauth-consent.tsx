import { useState } from 'react'
import { useAuth } from '@/lib/auth.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { cn } from '@/lib/utils.ts'
import { ConsentScreen, type ConsentApp } from '@/components/oauth-consent.tsx'

// development only (app.tsx adds the route only in dev or design-lab builds): the consent screen of sign in with ckauth
// with sample apps, until the /oauth endpoints exist (docs/OIDC.md). switch designs with the design lab (Alt+1…3)

const samples: { id: string, app: ConsentApp, scopes: string[] }[] = [
  { id: 'shop', app: { name: 'Shop', host: 'shop.example' }, scopes: ['openid', 'profile', 'email'] },
  { id: 'clinic', app: { name: 'Clinic Portal', host: 'portal.clinic.example' }, scopes: ['openid', 'email', 'profile', 'offline_access'] },
  { id: 'long', app: { name: 'Sunrise Community Gardens Members Area', host: 'members.sunrise-community-gardens.example' }, scopes: ['openid', 'email'] },
]

const sampleUser = { firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com' }

export function DevOauthConsent() {
  useDocumentTitle('Consent screen preview')
  const { user } = useAuth()
  const [sampleId, setSampleId] = useState(samples[0]!.id)
  const [result, setResult] = useState<string | null>(null)
  const sample = samples.find(item => item.id === sampleId)!

  // what the real page will do: the api answers {redirectTo} and the page navigates there itself (docs/OIDC.md, rule 11)
  const callback = `https://${sample.app.host}/callback`

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
        <span className="font-medium">Preview:</span>
        {samples.map(item => (
          <button key={item.id} type="button" onClick={() => { setSampleId(item.id); setResult(null) }}
            className={cn('rounded-full border px-3 py-1', item.id === sampleId ? 'border-primary text-primary' : 'text-muted-foreground')}>
            {item.app.name}
          </button>
        ))}
        {result && <span className="w-full break-all text-muted-foreground sm:w-auto">→ {result}</span>}
      </div>
      <ConsentScreen
        app={sample.app}
        scopes={sample.scopes}
        user={user ?? sampleUser}
        onAllow={() => setResult(`${callback}?code=…&state=…&iss=https://ckauth.chiragdev.com`)}
        onDeny={() => setResult(`${callback}?error=access_denied&state=…&iss=https://ckauth.chiragdev.com`)}
        onSwitchAccount={() => setResult('signs out, then /sign-in?continue=<request id>')}
      />
    </div>
  )
}
