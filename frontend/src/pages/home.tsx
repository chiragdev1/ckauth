import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, BadgeCheck, Check, ChevronDown, CodeXml, ExternalLink, EyeOff, Fingerprint, HeartHandshake, ImageUp, KeyRound, LogOut, Mail, MailCheck, Pause, PhoneOff, Play, RefreshCcw, ShieldBan, ShieldCheck, Timer, UserCheck, UserPlus, Vault, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth.tsx'
import { useLanguage } from '@/lib/language.tsx'
import { cn } from '@/lib/utils.ts'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { CONTACT_EMAIL, homeCopy, REPO_URL, type HomeCopy } from './home-copy.ts'

// the landing page, written for anyone running a website or app (words: home-copy.ts, from content/landing-page.md)
export function Home() {
  useDocumentTitle()
  const { language } = useLanguage()
  const copy = homeCopy[language]

  return (
    <div lang={language}>
      <Hero copy={copy} />
      <Ticker items={copy.ticker} pauseLabel={copy.tickerPause} />
      <Features copy={copy} />
      <Steps copy={copy} />
      <Business copy={copy} />
      <Developers copy={copy} />
      <Pricing copy={copy} />
      <Faq copy={copy} />
      <FinalCall copy={copy} />
    </div>
  )
}

// the secondary button stays on the page in the hero (how it works), so the only way off it is signing up
function Actions({ copy, secondary }: { copy: HomeCopy, secondary: 'how' | 'contact' }) {
  const { user } = useAuth()

  return (
    <>
      <Button asChild size="lg">
        {user ? <Link to="/dashboard">{copy.hero.dashboard}<ArrowRight /></Link> : <Link to="/sign-up">{copy.hero.primary}<ArrowRight /></Link>}
      </Button>
      <Button asChild size="lg" variant="outline">
        {secondary === 'how'
          ? <a href="#how-it-works">{copy.hero.secondary}</a>
          : <a href={`mailto:${CONTACT_EMAIL}`}><Mail />{copy.final.contact}</a>}
      </Button>
    </>
  )
}

// answers "what's the catch?" right under the button, where people decide whether to click
function Reassurance({ items, center }: { items: string[], center?: boolean }) {
  return (
    <ul className={cn('mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground', center && 'justify-center')}>
      {items.map(item => (
        <li key={item} className="flex items-center gap-1.5"><Check className="size-4 text-success" />{item}</li>
      ))}
    </ul>
  )
}

function Heading({ eyebrow, title, body, center }: { eyebrow: string, title: string, body?: string, center?: boolean }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className={cn('eyebrow flex items-center gap-3', center && 'justify-center')}><span className="h-px w-8 bg-primary" />{eyebrow}</p>
      <h2 className="font-display mt-4 text-3xl leading-tight font-semibold sm:text-5xl">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  )
}

function Hero({ copy }: { copy: HomeCopy }) {
  const { hero } = copy

  return (
    <section className="relative isolate overflow-hidden border-b">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <div aria-hidden className="bg-wall pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.15fr_1fr]">
        {/* slides in but never fades: text that starts at opacity 0 doesn't count as painted, which delays lcp by the whole fade */}
        <div className="animate-in slide-in-from-bottom-2 duration-700">
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium">
            <ShieldCheck className="size-4 shrink-0 text-primary" />{hero.badge}
          </p>
          <h1 className="font-display mt-6 text-4xl leading-[1.1] font-semibold sm:text-6xl">
            {hero.title}<br /><span className="text-primary">{hero.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{hero.body}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Actions copy={copy} secondary="how" />
          </div>
          <Reassurance items={hero.reassurance} />
          <dl className="mt-12 grid max-w-lg grid-cols-3 divide-x border-t pt-6">
            {hero.stats.map(stat => (
              // a term must come before its value in a <dl>, so screen readers read "1 min, to create an account" in order; flipped back visually
              <div key={stat.label} className="flex flex-col-reverse px-4 first:pl-0">
                <dt className="mt-1 text-xs leading-snug text-muted-foreground">{stat.label}</dt>
                <dd className="font-display text-2xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <SignInPreview copy={copy} />
      </div>
    </section>
  )
}

// the sign-in screen a shop's customer would see, with what ckauth checks behind it. decorative, so the
// fake fields are plain divs (nothing to tab into) and screen readers get the caption
function SignInPreview({ copy }: { copy: HomeCopy }) {
  const { phone } = copy

  return (
    <figure className="mx-auto w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div aria-hidden className="dossier rounded-[2.5rem] border-secondary bg-card p-6 pt-8">
        <p className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">{phone.shop}</p>
        <p className="font-display mt-2 text-center text-2xl font-semibold">{phone.heading}</p>
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">{phone.email}</div>
          <div className="rounded-xl border bg-background px-4 py-3 text-sm tracking-[0.3em] text-muted-foreground">••••••••••</div>
          <div className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">{phone.button}</div>
        </div>
        <ul className="mt-6 space-y-2.5 border-t pt-5">
          {phone.checks.map(check => (
            <li key={check} className="flex items-center gap-2.5 text-sm">
              <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-3.5" /></span>
              {check}
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />{phone.protectedBy}</p>
      </div>
      <figcaption className="mt-4 text-center text-sm text-muted-foreground">{phone.caption}</figcaption>
    </figure>
  )
}

// the strip itself is hidden from screen readers (the features section says the same); the pause button isn't (index.css, .ticker)
function Ticker({ items, pauseLabel }: { items: string[], pauseLabel: string }) {
  const [paused, setPaused] = useState(false)

  return (
    <div className="ticker relative border-y bg-secondary text-secondary-foreground" data-paused={paused ? '' : undefined}>
      <div className="overflow-hidden py-3.5 pr-12" aria-hidden>
        <div className="flex w-max animate-marquee">
          {[0, 1].map(copy => (
            <div key={copy} className="flex shrink-0 items-center">
              {items.map(item => (
                <span key={item} className="flex items-center gap-6 px-6 text-sm font-medium whitespace-nowrap">
                  {item}<span className="text-primary">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* reduced motion already stops the strip, so the button has nothing to do there */}
      <button
        type="button"
        onClick={() => setPaused(current => !current)}
        aria-label={pauseLabel}
        aria-pressed={paused}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center border-l border-border/20 bg-secondary transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:hidden"
      >
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
    </div>
  )
}

// same order as copy.features.items
const featureIcons: LucideIcon[] = [UserCheck, ShieldBan, Vault, Timer, EyeOff, LogOut]

function Features({ copy }: { copy: HomeCopy }) {
  const { features } = copy

  return (
    <section id="features" className="relative scroll-mt-20 border-b py-24 sm:py-32">
      <div aria-hidden className="bg-wall pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Heading eyebrow={features.eyebrow} title={features.title} body={features.body} center />
        <div className={"mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"}>
          {features.items.map((item, index) => {
            const Icon = featureIcons[index]!
            return (
              <article key={item.title} className="rounded-2xl border bg-card p-7">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-display mt-6 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const stepIcons: LucideIcon[] = [UserPlus, MailCheck, RefreshCcw, KeyRound]

function Steps({ copy }: { copy: HomeCopy }) {
  const { steps } = copy

  return (
    <section id="how-it-works" className="relative scroll-mt-20 overflow-hidden border-b bg-muted/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Heading eyebrow={steps.eyebrow} title={steps.title} body={steps.body} />
        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          <span aria-hidden className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-[repeating-linear-gradient(90deg,var(--border)_0_8px,transparent_8px_14px)] md:block" />
          {steps.items.map((step, index) => {
            const Icon = stepIcons[index]!
            return (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-4 md:flex-col md:items-start">
                  <span className="relative z-10 flex size-12 items-center justify-center rounded-full border-2 border-primary bg-background text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">{steps.stepLabel} {index + 1}</span>
                </div>
                <h3 className="font-display mt-4 text-2xl font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

const businessIcons: LucideIcon[] = [PhoneOff, HeartHandshake, Fingerprint, ImageUp]

function Business({ copy }: { copy: HomeCopy }) {
  const { business } = copy

  return (
    <section id="business" className="scroll-mt-20 border-b py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <Heading eyebrow={business.eyebrow} title={business.title} body={business.body} />
        <ul className="grid gap-5 sm:grid-cols-2">
          {business.items.map((item, index) => {
            const Icon = businessIcons[index]!
            return (
              <li key={item.title} className="rounded-2xl border bg-card p-6">
                <Icon className="size-6 text-primary" />
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// the second way in, for developers building sites for clients or for themselves
function Developers({ copy }: { copy: HomeCopy }) {
  const { developers } = copy

  return (
    <section id="developers" className="scroll-mt-20 bg-secondary py-20 text-secondary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-semibold"><CodeXml className="size-4" />{developers.eyebrow}</p>
          <h2 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">{developers.title}</h2>
          <p className="mt-3 leading-relaxed">{developers.body}</p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <a href={REPO_URL} target="_blank" rel="noreferrer">{developers.button}<ExternalLink /></a>
        </Button>
      </div>
    </section>
  )
}

// placeholder plans: ckauth is free for now, so the paid buttons stay disabled until those features exist.
// the highlight goes on the first plan you can actually pick, not the best deal, so the loudest card isn't a dead end
function Pricing({ copy }: { copy: HomeCopy }) {
  const { pricing } = copy
  const recommended = pricing.plans.findIndex(plan => plan.available)

  return (
    <section id="pricing" className="relative scroll-mt-20 border-b py-24 sm:py-32">
      <div aria-hidden className="bg-wall pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Heading eyebrow={pricing.eyebrow} title={pricing.title} body={pricing.body} center />
        <p className="mx-auto mt-8 w-fit rounded-full border border-success/30 bg-success/10 px-4 py-2 text-center text-sm font-medium">{pricing.banner}</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-start">
          {pricing.plans.map((plan, index) => {
            const highlighted = index === recommended
            return (
              <article key={plan.name} className={cn('relative flex flex-col rounded-2xl border bg-card p-7', highlighted && 'dossier border-primary')}>
                {highlighted && (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{pricing.recommended}</span>
                )}
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-semibold">{plan.price}</span>
                  {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                </p>
                <ul className="mt-6 space-y-2.5 border-t pt-6 text-sm">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex gap-2.5"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" />{feature}</li>
                  ))}
                </ul>
                {plan.available ? (
                  <Button asChild className="mt-8"><Link to="/sign-up">{plan.button}</Link></Button>
                ) : (
                  <Button variant="outline" className="mt-8" disabled>{plan.button}</Button>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// <details> opens and closes without javascript, so the answers work on the prerendered page too
function Faq({ copy }: { copy: HomeCopy }) {
  const { faq } = copy

  return (
    <section id="faq" className="scroll-mt-20 border-b bg-muted/40 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Heading eyebrow={faq.eyebrow} title={faq.title} center />
        <div className="mt-12 divide-y rounded-2xl border bg-card">
          {faq.items.map(item => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <FaqAnswer item={item} />
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

type FaqItem = HomeCopy['faq']['items'][number]

// a faint bubble, like a chat reply: the tint, the shape and the bold short answer set it apart from the question
function FaqAnswer({ item }: { item: FaqItem }) {
  return (
    <p className="mt-3 rounded-2xl rounded-tl-sm bg-primary/5 px-4 py-3 leading-relaxed">
      <strong className="font-semibold">{item.lead}</strong> <WithEmailLink text={item.a} />
      {item.link && <> <Link to={item.link.to} className="font-medium text-foreground underline underline-offset-4">{item.link.label}</Link>.</>}
    </p>
  )
}

// the help answer names the contact email; make it a link wherever it appears
function WithEmailLink({ text }: { text: string }) {
  const [before, after] = text.split(CONTACT_EMAIL)
  if(after === undefined) return text
  return <>{before}<a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">{CONTACT_EMAIL}</a>{after}</>
}

function FinalCall({ copy }: { copy: HomeCopy }) {
  const { final } = copy

  return (
    <section className="relative isolate overflow-hidden py-24 text-center sm:py-28">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="font-display text-4xl font-semibold sm:text-5xl">{final.title}</h2>
        <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">{final.body}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Actions copy={copy} secondary="contact" />
        </div>
        <Reassurance items={copy.hero.reassurance} center />
        <p className="mt-6 text-sm text-muted-foreground">
          {final.emailLine} <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-foreground underline underline-offset-4">{CONTACT_EMAIL}</a>
        </p>
      </div>
    </section>
  )
}
