import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/lib/use-document-title.ts'
import { CONTACT_EMAIL, REPO_URL } from './home-copy.ts'

// the privacy policy and terms. every statement here describes what the code does today
// (src/db/schema.ts, rate-limit.ts, auth/utils/constants.ts for cookies, deploy/backup.sh), so change them together.
// structure follows the usual gdpr / india dpdp act / ccpa checklist; see DEVLOG 27 Oct 2026

const UPDATED = '27 October 2026'
const OPERATOR = 'Chirag Arora'

type Section = { id: string, heading: string, body: ReactNode }

function Email() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
}

function LegalPage({ title, intro, sections }: { title: string, intro: ReactNode, sections: Section[] }) {
  useDocumentTitle(title)

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="eyebrow">Legal</p>
      <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {UPDATED}</p>
      <div className="mt-8 rounded-2xl border bg-muted/40 p-6 leading-relaxed text-muted-foreground [&_li]:mt-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">{intro}</div>

      <nav aria-label="On this page" className="mt-10 rounded-2xl border bg-card p-6">
        <p className="text-sm font-semibold">On this page</p>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {sections.map((section, index) => (
            <li key={section.id}><a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground">{index + 1}. {section.heading}</a></li>
          ))}
        </ol>
      </nav>

      {/* plain elements styled once here, so the sections below stay readable as text */}
      <div className="mt-12 space-y-12 leading-relaxed [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:mt-2 [&_p+p]:mt-4 [&_p+ul]:mt-4 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ul+p]:mt-4">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-display text-2xl font-semibold">{index + 1}. {section.heading}</h2>
            <div className="mt-4 text-muted-foreground">{section.body}</div>
          </section>
        ))}
      </div>
    </article>
  )
}

const privacySections: Section[] = [
  {
    id: 'who-we-are',
    heading: 'Who we are',
    body: (
      <>
        <p>CKAuth is an account and sign-in service at ckauth.chiragdev.com, run by {OPERATOR}, an independent developer in India. We decide how and why your personal data is used, which makes us its "data fiduciary" under India's Digital Personal Data Protection Act, 2023 (the DPDP Act), and its "controller" under the EU and UK GDPR.</p>
        <p>In this policy, "we" means CKAuth and "you" means anyone who visits the site or creates an account. Questions go to <Email />.</p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    heading: 'What we collect',
    body: (
      <>
        <p><strong>What you give us:</strong></p>
        <ul>
          <li><strong>Account details:</strong> your first name, your last name if you give one, your email address and, only if you give it, your age (our sign-up form doesn't ask for it).</li>
          <li><strong>Your password, as a one-way hash.</strong> We store a bcrypt hash, never the password itself. Nobody, including us, can turn it back into your password.</li>
          <li><strong>Profile photo,</strong> if you upload one. It's stored under a random file name, so its web address doesn't reveal who you are.</li>
          <li><strong>Messages you send us,</strong> such as support or privacy requests by email.</li>
        </ul>
        <p><strong>What we record automatically:</strong></p>
        <ul>
          <li><strong>Security records:</strong> hashed copies of your session and email-link tokens, when they expire, whether your email is confirmed, and when your account was created and last changed.</li>
          <li><strong>Server logs:</strong> your IP address, the time, the page or action requested and your browser's name and version. If sending an email to you fails, the error log includes your email address.</li>
          <li><strong>Rate-limit counters:</strong> to block password guessing, we count recent attempts per IP address, per email address and per account.</li>
        </ul>
        <p>We don't collect data about you from other sources, and we don't collect sensitive data such as financial, health or government ID details.</p>
      </>
    ),
  },
  {
    id: 'what-we-dont',
    heading: 'What we don\'t do',
    body: (
      <ul>
        <li>We don't sell, rent or trade your data, and we don't share it for advertising.</li>
        <li>We don't show ads, and we don't use analytics, tracking pixels or third-party cookies.</li>
        <li>We don't build profiles of you. The only automatic decision we make is a temporary block after too many attempts (at most an hour), which lifts on its own; email us if you think it was wrong.</li>
        <li>We don't read your password, and we never send one by email.</li>
      </ul>
    ),
  },
  {
    id: 'cookies',
    heading: 'Cookies and local storage',
    body: (
      <>
        <p>We use two cookies, both strictly necessary to keep you signed in. That's why we don't ask for cookie consent, and why they can't be switched off while you use your account:</p>
        <ul>
          <li><strong>access_token</strong> proves who you are for about 15 minutes.</li>
          <li><strong>refresh_token</strong> renews it for up to a day, until you sign out.</li>
        </ul>
        <p>Both are <code>httpOnly</code> (page scripts can't read them), only sent over HTTPS, and only sent to this site. Your browser's local storage also remembers your light or dark theme and your language choice, and its session storage (cleared when you close the tab) notes the time of an automatic reload after we release a new version, so it can't repeat in a loop. All of this stays on your device and is never sent to us. Since we don't track you, there's nothing for a "Do Not Track" or Global Privacy Control signal to switch off.</p>
      </>
    ),
  },
  {
    id: 'why',
    heading: 'Why we use it, and on what basis',
    body: (
      <ul>
        <li><strong>To run your account:</strong> creating it, confirming your email, signing you in, resetting your password and showing your photo. This is necessary to provide the service you asked for, and under the DPDP Act it rests on the consent you give when you sign up.</li>
        <li><strong>To send account emails:</strong> confirmation links, password resets, and a notice if someone tries to sign up with your address. These are part of the service. We don't send marketing emails.</li>
        <li><strong>To keep CKAuth and your account secure:</strong> blocking repeated wrong guesses, investigating abuse and fixing faults, using logs and rate-limit counters. This is our legitimate interest in protecting users, and a "legitimate use" under the DPDP Act.</li>
        <li><strong>To meet legal obligations,</strong> such as answering a lawful request from the authorities.</li>
      </ul>
    ),
  },
  {
    id: 'sharing',
    heading: 'Who we share it with',
    body: (
      <>
        <p>We use a small number of service providers ("data processors"), who handle data only on our instructions and only to run CKAuth:</p>
        <ul>
          <li><strong>Hostinger</strong> hosts our server, database and logs.</li>
          <li><strong>Resend</strong> delivers our emails, so it receives your email address and the message.</li>
          <li><strong>ImageKit</strong> stores and serves profile photos. When a page shows a photo, your browser loads it from ImageKit, which sees your IP address.</li>
        </ul>
        <p>Beyond them, we share data only when the law requires it, or when it's needed to protect the safety of our users or the service. If CKAuth is ever transferred to someone else, your data would move with it under this policy, and we'd tell you beforehand.</p>
      </>
    ),
  },
  {
    id: 'transfers',
    heading: 'Where your data is stored',
    body: <p>Our providers may store and process data outside India, including in the United States and the European Union. We only use providers that commit, in their terms, to protect personal data and to process it only for us. India's DPDP Act allows these transfers except to countries the Government restricts, and we'll stop any transfer that becomes restricted.</p>,
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    body: (
      <ul>
        <li><strong>Account data:</strong> for as long as your account exists. When you ask us to delete it, we remove it from the live database and delete your photo.</li>
        <li><strong>Unconfirmed sign-ups:</strong> an account whose email was never confirmed is kept until it's confirmed or you ask us to delete it. It can't be used to sign in.</li>
        <li><strong>Backups:</strong> nightly copies of the database are kept for 14 days, so deleted data disappears from them within 14 days.</li>
        <li><strong>Rate-limit counters:</strong> one hour at most.</li>
        <li><strong>Email links:</strong> expire after 15 minutes and stop working once used.</li>
        <li><strong>Server logs and emails you send us:</strong> for a limited period, only as long as we need them for security, troubleshooting or answering you.</li>
        <li>We may keep data longer only where the law requires it.</li>
      </ul>
    ),
  },
  {
    id: 'security',
    heading: 'How we protect it',
    body: <p>Passwords and tokens are stored as hashes, every connection uses HTTPS, the database has no public network access, repeated wrong guesses are blocked, and uploaded photos are checked to be real images. No system is perfectly secure. If a breach affects your data, we'll tell you and the Data Protection Board of India (and any other authority the law requires) without undue delay, along with what happened and what you can do.</p>,
  },
  {
    id: 'your-rights',
    heading: 'Your rights',
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li><strong>access</strong> your data: what we hold, how we use it, and who we've shared it with,</li>
          <li><strong>correct or update</strong> it,</li>
          <li><strong>erase</strong> your account and its data, or <strong>withdraw your consent</strong>, which is as easy as giving it: one email. Withdrawing consent ends your account, since we can't run it without the data,</li>
          <li><strong>nominate</strong> someone to act for you if you die or can't act yourself.</li>
        </ul>
        <p>If you're in the EU or UK, you can also ask for a copy of your data in a portable format, and object to or ask us to restrict how we use it.</p>
        <p>You can change your password and photo yourself from your dashboard. For anything else, email <Email /> from the address on your account, so we know the request is really yours. It's free. We'll reply within 30 days.</p>
        <p>If you're not satisfied with our answer, you can complain to the Data Protection Board of India, or to the data protection authority where you live.</p>
      </>
    ),
  },
  {
    id: 'children',
    heading: 'Children',
    body: <p>CKAuth is not meant for anyone under 18, and we don't knowingly collect data about children. If you believe a child has created an account, email us and we'll delete it.</p>,
  },
  {
    id: 'other-sites',
    heading: 'Links to other sites',
    body: <p>Our site links to others, such as GitHub. Their own privacy policies apply there, not this one.</p>,
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    body: <p>If we change this policy, we'll update the date at the top. If a change affects how we use your data, we'll email you before it takes effect, and ask for your consent again where the law requires it.</p>,
  },
  {
    id: 'contact',
    heading: 'Contact and Grievance Officer',
    body: <p>Questions, requests and complaints about your data go to our Grievance Officer, {OPERATOR}, at <Email />. We acknowledge every message and reply within 30 days.</p>,
  },
]

export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={(
        <>
          <p><strong>In short:</strong></p>
          <ul>
            <li>We keep only what's needed to run your account safely: your name, email, a hashed password and an optional photo.</li>
            <li>No ads, no tracking, and we never sell your data.</li>
            <li>You can see, correct or delete your data at any time by emailing us.</li>
          </ul>
        </>
      )}
      sections={privacySections}
    />
  )
}

const termsSections: Section[] = [
  {
    id: 'agreement',
    heading: 'Agreement',
    body: (
      <>
        <p>These terms are an agreement between you and CKAuth, run by {OPERATOR} in India. By creating an account or using ckauth.chiragdev.com, you agree to them and to our <Link to="/privacy">Privacy Policy</Link>. If you don't agree, please don't use the service.</p>
        <p>If you use CKAuth for a business or other organisation, you confirm that you're allowed to accept these terms for it, and "you" includes that organisation.</p>
      </>
    ),
  },
  {
    id: 'service',
    heading: 'The service',
    body: <p>CKAuth provides accounts and secure sign-in: sign-up with email confirmation, sign-in, password reset and change, and profile photos. It is in <strong>early access</strong>: features may change or be removed, and there may be bugs or downtime. Please don't make CKAuth the only place you keep anything you can't afford to lose. We'll tell you about significant changes in advance.</p>,
  },
  {
    id: 'account',
    heading: 'Your account',
    body: (
      <ul>
        <li>You must be at least 18 years old.</li>
        <li>Give accurate details, and use an email address that belongs to you.</li>
        <li>Keep your password secret. You're responsible for what happens under your account, so tell us at once if you think someone else has used it.</li>
        <li>An account is for one person. Don't share it or sell it.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    body: (
      <>
        <p>Please don't:</p>
        <ul>
          <li>try to get into accounts that aren't yours, or guess passwords,</li>
          <li>overload, attack or get around the service's security, including its rate limits,</li>
          <li>use bots or scripts to create accounts or send requests in bulk,</li>
          <li>upload anything unlawful, harmful or obscene, or anything you don't have the right to use,</li>
          <li>pretend to be someone else, or use the service for spam, fraud or anything illegal.</li>
        </ul>
        <p>Found a security problem? We welcome responsible reports at <Email />. Please don't access other people's data or disrupt the service while testing, and give us a reasonable time to fix it before telling others.</p>
      </>
    ),
  },
  {
    id: 'your-content',
    heading: 'Your content',
    body: <p>Your profile photo stays yours. You allow us to store, resize and show it where the service needs to, only for as long as it's on your account. We may remove a photo that breaks these terms.</p>,
  },
  {
    id: 'our-content',
    heading: 'Our name and content',
    body: <p>The CKAuth name, logo, and this site's design and text belong to us. These terms don't let you use them, except to refer to CKAuth accurately. If you send us ideas or feedback, we may use them freely, without owing you anything.</p>,
  },
  {
    id: 'open-source',
    heading: 'Open-source code',
    body: <p>CKAuth's source code is published on <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>. Using that code is governed by the licence in the repository, not by these terms. These terms cover the hosted service at ckauth.chiragdev.com.</p>,
  },
  {
    id: 'third-parties',
    heading: 'Other services',
    body: <p>CKAuth relies on other companies to host the site, send email and store photos (listed in our <Link to="/privacy#sharing">Privacy Policy</Link>), and links to other sites such as GitHub. We aren't responsible for those services' own sites, terms or content.</p>,
  },
  {
    id: 'pricing',
    heading: 'Pricing',
    body: <p>CKAuth is free during early access. If we introduce paid plans, we'll announce the prices in advance, a free plan will remain, and you'll never be charged without choosing a paid plan yourself.</p>,
  },
  {
    id: 'ending',
    heading: 'Ending your account',
    body: <p>You can stop using CKAuth at any time and ask us to delete your account by emailing <Email />. We may suspend or close an account that breaks these terms or puts other users at risk, and we'll tell you why unless the law or safety prevents it. Sections that by their nature should last, such as "Our name and content", "No warranty", "Limitation of liability" and "Governing law", continue to apply after your account ends.</p>,
  },
  {
    id: 'disclaimer',
    heading: 'No warranty',
    body: <p>We work hard to keep CKAuth secure and available, but it's provided "as is" and "as available", without guarantees that it will be uninterrupted, error-free or fit for a particular purpose. As far as the law allows, we make no other promises about it. Nothing here affects rights you have as a consumer that can't be excluded.</p>,
  },
  {
    id: 'liability',
    heading: 'Limitation of liability',
    body: <p>As far as the law allows, we aren't liable for indirect or consequential losses, such as lost profits, revenue or data, arising from your use of CKAuth. While the service is free, our total liability to you for all claims is limited to ₹1,000. Nothing in these terms limits liability for fraud, or any other liability that can't be limited by law.</p>,
  },
  {
    id: 'indemnity',
    heading: 'Your responsibility to us',
    body: <p>If someone makes a claim against us because you broke these terms or the law while using CKAuth, you'll cover the reasonable costs that claim causes us, as far as the law allows.</p>,
  },
  {
    id: 'grievances',
    heading: 'Complaints and Grievance Officer',
    body: <p>To report content that breaks these terms or the law, or to raise any complaint about the service, write to our Grievance Officer, {OPERATOR}, at <Email />. We'll acknowledge your complaint within 24 hours and resolve it within 15 days, as India's Information Technology Rules, 2021 require.</p>,
  },
  {
    id: 'law',
    heading: 'Governing law',
    body: <p>These terms are governed by the laws of India, and disputes are subject to the exclusive jurisdiction of the courts of India. Please contact us first: most problems can be solved by email.</p>,
  },
  {
    id: 'changes',
    heading: 'Changes to these terms',
    body: <p>We may update these terms as the service grows. We'll update the date at the top, and email you about significant changes at least 15 days before they take effect. Continuing to use CKAuth after that means you accept the new terms; if you don't, you can close your account.</p>,
  },
  {
    id: 'general',
    heading: 'General',
    body: (
      <ul>
        <li><strong>Notices:</strong> we'll contact you at the email address on your account, and you can reach us at <Email />.</li>
        <li><strong>Whole agreement:</strong> these terms and the Privacy Policy are the whole agreement between us about the hosted service.</li>
        <li><strong>Severability:</strong> if a court finds part of these terms unenforceable, the rest still applies.</li>
        <li><strong>No waiver:</strong> if we don't enforce a term straight away, we can still enforce it later.</li>
        <li><strong>Transfer:</strong> you can't transfer your rights under these terms. We may transfer ours if CKAuth is transferred, and we'll tell you if we do.</li>
        <li><strong>Events beyond our control:</strong> we aren't responsible for delays or failures caused by events we can't reasonably control, such as outages at our providers, natural disasters or government action.</li>
      </ul>
    ),
  },
]

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={(
        <>
          <p><strong>In short:</strong></p>
          <ul>
            <li>Use CKAuth honestly, keep your password safe, and don't attack the service or other people's accounts.</li>
            <li>It's free during early access, and we'll never charge you without your choice.</li>
            <li>You can leave at any time and ask us to delete your data.</li>
          </ul>
        </>
      )}
      sections={termsSections}
    />
  )
}
