// the landing page words for anyone running a website or app (source: content/landing-page.md). english only since
// 7 nov 2026: the hindi version was removed
// only promise what ckauth does today: the paid plans are placeholders and say "coming soon" until they're real

export const CONTACT_EMAIL = 'chiragaroradev@gmail.com'
export const REPO_URL = 'https://github.com/chiragdev1/ckauth'

const en = {
  nav: {
    features: 'Features',
    howItWorks: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
    signIn: 'Sign in',
    tryFree: 'Get started free',
    skip: 'Skip to content',
  },
  footer: {
    tagline: 'Your website\'s security guard',
    question: 'Questions? Write to',
    signIn: 'Sign in',
    createAccount: 'Create account',
    forgot: 'Forgot password',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  hero: {
    badge: 'Every sign-in is a door. Is yours guarded?',
    title: 'Meet CKAuth,',
    titleAccent: 'your website\'s security guard.',
    body: 'It confirms every new account, stops anyone guessing passwords, and keeps watch day and night. You build what matters. CKAuth guards the door.',
    primary: 'Create your free account',
    dashboard: 'Go to dashboard',
    secondary: 'See how it works',
    reassurance: ['Free during early access', 'No card required', 'Ready in under a minute'],
    stats: [
      { value: '1 min', label: 'to create an account' },
      { value: '15 min', label: 'and every email link expires' },
      { value: '0', label: 'people who can read a password, not even us' },
    ],
  },
  phone: {
    shop: 'yourwebsite.com',
    heading: 'Sign in',
    email: 'you@example.com',
    button: 'Sign in',
    protectedBy: 'Protected by CKAuth',
    checks: ['Email confirmed', 'Password stored unreadable', 'Repeated guesses blocked'],
    caption: 'What your users see. What CKAuth checks.',
  },
  tickerPause: 'Pause the moving strip',
  ticker: ['Email-confirmed accounts', 'Password-guessing protection', 'Unreadable passwords', 'One-time links', 'A private user list', 'Verified image uploads', 'Works on every device'],
  features: {
    eyebrow: 'On duty, around the clock',
    title: 'A guard that never takes a day off',
    body: 'Attackers look for the one door nobody is watching. CKAuth watches every door, every time.',
    items: [
      { title: 'Checks every new account at the door', body: 'No account opens until its owner proves the email is theirs. Fake and mistyped addresses stay out.' },
      { title: 'Stops anyone guessing passwords', body: 'Like an ATM after too many wrong PINs, CKAuth blocks repeated wrong tries, even when the attacker keeps switching networks.' },
      { title: 'Locks passwords away, even from us', body: 'Passwords are stored as a one-way code, like valuables in a bank locker. Stolen data is useless to a thief.' },
      { title: 'Sends links that work only once', body: 'Every email link works one time and expires after 15 minutes, just like an OTP.' },
      { title: 'Keeps your user list private', body: 'Nobody can find out who has an account. Everyone gets the same answer.' },
      { title: 'Signs out lost devices for you', body: 'When someone changes or resets their password, every other phone and computer is signed out.' },
    ],
  },
  steps: {
    eyebrow: 'How it works',
    title: 'Sign up. Confirm. Stay safe.',
    body: 'No passwords in emails, no codes to copy, no guessing what comes next.',
    stepLabel: 'Step',
    items: [
      { title: 'Sign up', body: 'Name, email, password. A meter shows how strong the password is.' },
      { title: 'Confirm your email', body: 'Open the link we send and enter your password once more. You\'re in.' },
      { title: 'Stay signed in, safely', body: 'No sign-in on every visit. CKAuth quietly checks it\'s still you.' },
      { title: 'Forgot your password?', body: 'A reset link by email, and you\'re back in a minute.' },
    ],
  },
  business: {
    eyebrow: 'Why it matters',
    title: 'Big-company security. No security team needed.',
    body: 'One break-in can undo years of trust. Whether you run a shop, a clinic, a startup or a community, CKAuth on your sign-in helps you keep that trust.',
    items: [
      { title: 'Fewer support requests', body: 'People reset their own passwords and update their own photo.' },
      { title: 'Users who trust you', body: 'A safe, smooth sign-in looks professional. People stay where they feel safe.' },
      { title: 'Nobody can pose as your users', body: 'Signing up with someone else\'s email gets an impostor nothing. They\'d need the inbox and the password.' },
      { title: 'Only real images get in', body: 'Every profile photo is checked, so harmful files disguised as pictures are blocked.' },
    ],
  },
  developers: {
    eyebrow: 'Building for clients, or for yourself?',
    title: 'Give every project the same strong lock.',
    body: 'CKAuth is open source on GitHub, and its README walks through setup. Set it up once, and use it on every site you build.',
    button: 'View the code on GitHub',
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Simple pricing. Free while we launch.',
    body: 'Every plan includes the full security guard. Pay only when you grow.',
    banner: 'Early access: every feature is free today. Paid plans have not started yet.',
    recommended: 'Available now',
    plans: [
      { name: 'Free', price: '₹0', period: '', tagline: 'To get started', features: ['All security features', 'Email confirmation for every user', 'Password reset by email'], button: 'Start free', available: true },
      { name: 'Monthly', price: '₹99', period: '/ month', tagline: 'For growing teams', features: ['Everything in Free', 'Priority email support', 'Your brand name on sign-in emails'], button: 'Coming soon', available: false },
      { name: 'Yearly', price: '₹999', period: '/ year', tagline: 'Best value: save ₹189', features: ['Everything in Monthly', 'About two months free', 'Early access to new features'], button: 'Coming soon', available: false },
    ],
  },
  faq: {
    eyebrow: 'Good to know',
    title: 'Frequently asked questions',
    items: [
      { q: 'Who is CKAuth for?', lead: 'Anyone with users to protect.', a: 'Online shops, clinics, tutors, startups, communities and side projects: if people sign in, CKAuth keeps their accounts safe.' },
      { q: 'Do I need to know how to code?', lead: 'Today, a developer sets it up.', a: 'CKAuth is open source, and a developer can add it to your website by following its README. A no-code way to connect your website is on the way. Until then, you can create an account and try the sign-in your users would see.' },
      { q: 'Can you see my users\' passwords?', lead: 'No, never.', a: 'They\'re stored as a one-way code that nobody can read, including us.' },
      { q: 'What do you do with my data?', lead: 'Only what the service needs.', a: 'No ads, no tracking, and we never sell it.', link: { to: '/privacy', label: 'Read the Privacy Policy' } },
      { q: 'What if someone forgets their password?', lead: 'They fix it themselves.', a: 'An email link lets them choose a new one. No support ticket needed.' },
      { q: 'What if someone loses their phone?', lead: 'Change the password.', a: 'Every other phone and computer is signed out at once.' },
      { q: 'How much does it cost?', lead: 'Free during early access.', a: 'Paid plans will start later at ₹99/month or ₹999/year, and there will always be a free plan.' },
      { q: 'How do I get help?', lead: 'Email us.', a: `Write to ${CONTACT_EMAIL}.` },
    ],
  },
  final: {
    title: 'Put a guard on your door today.',
    body: 'Create a free account in under a minute and see how safe and simple it feels.',
    primary: 'Create your free account',
    contact: 'Talk to us',
    emailLine: 'Questions? Write to',
  },
}

export type HomeCopy = typeof en

export const homeCopy = en
