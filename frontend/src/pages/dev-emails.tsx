import { useEffect, useState } from 'react'
import { api } from '@/lib/api.ts'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { cn } from '@/lib/utils.ts'
import { Spinner } from '@/components/brand.tsx'
import { FormAlert } from '@/components/form.tsx'

// development only (app.tsx adds the route only when LAB_ENABLED, and the api's /dev router only exists outside
// production): every email the api sends, rendered by the real templates with sample values, to compare the colour
// themes in light mode, dark mode and an approximation of the gmail app's own recolouring

type Preview = { themes: string[], emails: { id: string, subject: string }[] }
type Mode = 'light' | 'dark' | 'gmail'

const themeNames: Record<string, string> = { midnight: 'Midnight' }
const modes: { id: Mode, label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark (Apple Mail, Outlook)' },
  { id: 'gmail', label: 'Gmail app (approximation)' },
]

export function DevEmails() {
  useDocumentTitle('Email designs')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('verification')
  const [mode, setMode] = useState<Mode>('light')
  const [wide, setWide] = useState(false)

  useEffect(() => {
    api<Preview>('/dev/emails').then(({ data }) => setPreview(data), () => setError('The API has no /dev routes: is it running outside production (pnpm dev)?'))
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-8">
      <div>
        <p className="eyebrow">Development only</p>
        <h1 className="font-display mt-1 text-3xl font-semibold">Email designs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every email, rendered by the API's real templates with sample values. The Spotlight design in the Midnight theme. A new theme added to email-layout.ts shows up here to compare.</p>
      </div>
      {error && <FormAlert kind="error">{error}</FormAlert>}
      {!preview && !error && <Spinner />}
      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Choice label="Email" value={email} onChange={setEmail} options={preview.emails.map(item => ({ id: item.id, label: item.subject }))} select />
            <Choice label="Mode" value={mode} onChange={value => setMode(value as Mode)} options={modes} />
            <Choice label="Width" value={wide ? 'wide' : 'phone'} onChange={value => setWide(value === 'wide')} options={[{ id: 'phone', label: 'Phone' }, { id: 'wide', label: 'Desktop' }]} />
          </div>
          <div className={cn('grid gap-5', wide ? 'grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3')}>
            {preview.themes.map(theme => (
              <figure key={theme} className="space-y-2">
                <figcaption className="font-display text-sm font-semibold">{themeNames[theme] ?? theme}</figcaption>
                <EmailFrame src={`/api/dev/emails/${email}?theme=${theme}`} mode={mode} wide={wide} title={`${themeNames[theme]}: ${email}`} />
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Choice({ label, value, onChange, options, select }: { label: string, value: string, onChange: (value: string) => void, options: { id: string, label: string }[], select?: boolean }) {
  if(select) {
    return (
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <select value={value} onChange={event => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-card px-2">
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    )
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1 text-sm">
      <span className="mr-1 text-muted-foreground">{label}</span>
      {options.map(option => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} onClick={() => onChange(option.id)}
          className={cn('rounded-full border px-3 py-1', value === option.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-secondary')}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

// "dark" turns the email's own prefers-color-scheme rules on, which is what a dark-mode mail app does; setting
// color-scheme on the iframe doesn't reach the media query inside it, so the rules are rewritten to always apply.
// the gmail apps don't read that media query; they recolour light backgrounds and dark text themselves and leave images
// alone, which inverting the light version (and re-inverting its images) roughly imitates
function EmailFrame({ src, mode, wide, title }: { src: string, mode: Mode, wide: boolean, title: string }) {
  const [height, setHeight] = useState(900)

  function handleLoad(event: React.SyntheticEvent<HTMLIFrameElement>) {
    const doc = event.currentTarget.contentDocument
    if(!doc) return
    if(mode === 'dark') {
      for(const style of doc.querySelectorAll('style')) {
        style.textContent = (style.textContent ?? '').replace('@media (prefers-color-scheme: dark)', '@media all')
      }
    }
    if(mode === 'gmail') {
      const style = doc.createElement('style')
      style.textContent = 'html { filter: invert(1) hue-rotate(180deg); } img { filter: invert(1) hue-rotate(180deg); }'
      doc.head.append(style)
    }
    setHeight(doc.documentElement.scrollHeight + 8)
  }

  return (
    <iframe
      key={`${src}-${mode}`}
      src={src}
      title={title}
      onLoad={handleLoad}
      style={{ height }}
      className={cn('w-full rounded-xl border border-border bg-white', wide ? 'max-w-[640px]' : 'max-w-[390px]')}
    />
  )
}
