# CKAuth landing page copy

Copy for the home page, written for anyone who runs a website or app and has users to protect: online shops, clinics, tutors, startups, communities and side projects. Most readers aren't security experts. The live page reads these words from `src/pages/home-copy.ts`, so change both together. The sections follow the page's order.

## How this page talks

The page borrows the *message*, not the look, from two pages that do it well:

- **dsa.chaicode.com (Chai Prep)** names the result the reader wants, takes away confusion instead of scaring people, lays out one clear path, and gives a second audience its own way in.
- **devin.ai** introduces the product as a member of your team ("Meet Devin, your team's…"), starts every feature heading with something it *does for you*, promises the finished result rather than listing parts, and ends with a short command.

So, on this page:
1. **CKAuth is a person on your team:** your website's security guard, who works every hour of the day.
2. **Headings start with an action word** and describe what the guard does for you: *Checks…, Stops…, Locks…, Keeps…*
3. **Promise the feeling, not the parts:** your users are safe, and they trust you.
4. **Calm and professional, not scary.** Name the worry once ("one break-in can undo years of trust"), then reassure. No emoji and no slang.
5. **Generic, with examples.** Speak to "your website" and "your users". When a concrete picture helps, list a range (a shop, a clinic, a startup, a community) rather than one kind of business.
6. **One simple path:** sign up → confirm → stay safe.
7. **Two ways in:** people with a website first, and developers building for clients or themselves second.
8. **Short lines.** Most sentences are under 15 words, and headings are often fragments.
9. **Honest proof only.** Use real numbers from the product, and label anything that's a placeholder. There are no customers yet, so **no** made-up logos, testimonials or user counts.
10. **Familiar comparisons:** bank locker, ATM PIN, OTP. Prices stay in ₹.
11. **Only promise what CKAuth does today.** There's no SMS/WhatsApp OTP and no Google login yet, so don't mention them. There's also no no-code way to connect a website yet: today a developer adds CKAuth by following the README, so never say coding isn't needed until the dashboard can connect a site. CKAuth is free during early access. The paid plans are placeholders, so the page must say clearly that they haven't started.

### Written to convert

The page has one job: turn a visit into a sign-up.
- **One primary action, everywhere:** "Create your free account" in the hero, the pricing card and the closing section; "Get started free" in the header. Specific button text ("your free account") beats generic ("Try it").
- **The hero's second button stays on the page** ("See how it works" scrolls down). Links that leave the page (GitHub, email) only appear further down.
- **Screen-reader and control labels** (not visible): the skip link says "Skip to content", and the ticker's pause button says "Pause the moving strip".
- **Answer "what's the catch?" under the button:** Free during early access · No card required · Ready in under a minute. It appears under the hero buttons and again under the closing buttons.
- **Handle doubts in the FAQ:** who it's for, coding (honestly: a developer sets it up today), passwords, data use (with a link to the Privacy Policy), cost.
- **Low-friction consent:** sign-up says what you agree to in one line with links to the Terms and Privacy Policy, instead of adding a field.

Fixed details:
- Contact email: chiragaroradev@gmail.com
- Developer link: https://github.com/chiragdev1/ckauth (its README explains setup)
- Pricing (placeholder): Free, ₹99/month, ₹999/year
- Legal pages: `/privacy` and `/terms` (`src/pages/legal.tsx`, English only)

---

## 1. Search title and description (`index.html`)

| | English |
|---|---|
| Title (50–60 chars) | Secure Sign-In and User Accounts for Your Website · CKAuth |
| Description (140–160 chars) | Protect every account on your website with CKAuth: email-confirmed sign-ups, passwords no one can read and blocked guessing. Free, no card. Get started now. |

---

## 2. Hero (top of the page)

| | English |
|---|---|
| Badge (the worry, named once) | Every sign-in is a door. Is yours guarded? |
| Headline | Meet CKAuth, **your website's security guard.** |
| Sub-headline | It confirms every new account, stops anyone guessing passwords, and keeps watch day and night. You build what matters. CKAuth guards the door. |
| Primary button | Create your free account |
| Secondary button (scrolls to How it works) | See how it works |
| Reassurance (under the buttons) | Free during early access · No card required · Ready in under a minute |

**Hero picture:** a demo sign-in screen for `yourwebsite.com` with three ticks under it: Email confirmed, Password stored unreadable, Repeated guesses blocked. Caption: "What your users see. What CKAuth checks."

**Real numbers (stats row)**

| Value | Label |
|---|---|
| 1 min | to create an account |
| 15 min | and every email link expires |
| 0 | people who can read a password, not even us |

---

## 3. Moving strip (ticker)

- Email-confirmed accounts ✦ Password-guessing protection ✦ Unreadable passwords ✦ One-time links ✦ A private user list ✦ Verified image uploads ✦ Works on every device

---

## 4. What your guard does

- Eyebrow: On duty, around the clock
- Title: A guard that never takes a day off
- Body: Attackers look for the one door nobody is watching. CKAuth watches every door, every time.

| Heading | Text |
|---|---|
| Checks every new account at the door | No account opens until its owner proves the email is theirs. Fake and mistyped addresses stay out. |
| Stops anyone guessing passwords | Like an ATM after too many wrong PINs, CKAuth blocks repeated wrong tries, even when the attacker keeps switching networks. |
| Locks passwords away, even from us | Passwords are stored as a one-way code, like valuables in a bank locker. Stolen data is useless to a thief. |
| Sends links that work only once | Every email link works one time and expires after 15 minutes, just like an OTP. |
| Keeps your user list private | Nobody can find out who has an account. Everyone gets the same answer. |
| Signs out lost devices for you | When someone changes or resets their password, every other phone and computer is signed out. |

---

## 5. One simple path

- Eyebrow: How it works
- Title: Sign up. Confirm. Stay safe.
- Body: No passwords in emails, no codes to copy, no guessing what comes next.

| # | Title | Text |
|---|---|---|
| 1 | Sign up | Name, email, password. A meter shows how strong the password is. |
| 2 | Confirm your email | Open the link we send and enter your password once more. You're in. |
| 3 | Stay signed in, safely | No sign-in on every visit. CKAuth quietly checks it's still you. |
| 4 | Forgot your password? | A reset link by email, and you're back in a minute. |

---

## 6. Why it matters

- Eyebrow: Why it matters
- Title: Big-company security. No security team needed.
- Body: One break-in can undo years of trust. Whether you run a shop, a clinic, a startup or a community, CKAuth on your sign-in helps you keep that trust.

| Title | Text |
|---|---|
| Fewer support requests | People reset their own passwords and update their own photo. |
| Users who trust you | A safe, smooth sign-in looks professional. People stay where they feel safe. |
| Nobody can pose as your users | Signing up with someone else's email gets an impostor nothing. They'd need the inbox and the password. |
| Only real images get in | Every profile photo is checked, so harmful files disguised as pictures are blocked. |

---

## 7. For developers (the second way in)

- Eyebrow: Building for clients, or for yourself?
- Title: Give every project the same strong lock.
- Body: CKAuth is open source on GitHub, and its README walks through setup. Set it up once, and use it on every site you build.
- Button: View the code on GitHub

---

## 8. Pricing (placeholder plans; CKAuth is free during early access)

- Eyebrow: Pricing
- Title: Simple pricing. Free while we launch.
- Body: Every plan includes the full security guard. Pay only when you grow.
- Banner (above the cards): Early access: every feature is free today. Paid plans have not started yet.

| | Free | Monthly | Yearly |
|---|---|---|---|
| Price | ₹0 | ₹99 / month | ₹999 / year |
| Tagline | To get started | For growing teams | Best value: save ₹189 |
| Includes | All security features · Email confirmation for every user · Password reset by email | Everything in Free · Priority email support · Your brand name on sign-in emails | Everything in Monthly · About two months free · Early access to new features |
| Button | Start free | Coming soon | Coming soon |

Notes on the placeholder plans:
- ₹99 × 12 = ₹1,188, so the yearly plan saves ₹189 (about 16%, close to two months free).
- The paid plans list **features CKAuth doesn't have yet** (priority support, your brand on emails, early access). Keep "Coming soon" on those buttons and the banner until the features exist.
- Highlight the first plan people can actually pick (Free today), labelled "Available now". Highlighting a "Coming soon" plan makes the loudest card a dead end. The yearly card's tagline still says it's the best value.

---

## 9. Good to know (FAQ)

Each answer starts with a short reply in bold, then the detail. On the page, the answer sits in a faint bubble under the question.

| Question | Short answer | Detail |
|---|---|---|
| Who is CKAuth for? | Anyone with users to protect. | Online shops, clinics, tutors, startups, communities and side projects: if people sign in, CKAuth keeps their accounts safe. |
| Do I need to know how to code? | Today, a developer sets it up. | CKAuth is open source, and a developer can add it to your website by following its README. A no-code way to connect your website is on the way. Until then, you can create an account and try the sign-in your users would see. |
| Can you see my users' passwords? | No, never. | They're stored as a one-way code that nobody can read, including us. |
| What do you do with my data? | Only what the service needs. | No ads, no tracking, and we never sell it. *Link:* Read the Privacy Policy |
| What if someone forgets their password? | They fix it themselves. | An email link lets them choose a new one. No support ticket needed. |
| What if someone loses their phone? | Change the password. | Every other phone and computer is signed out at once. |
| How much does it cost? | Free during early access. | Paid plans will start later at ₹99/month or ₹999/year, and there will always be a free plan. |
| How do I get help? | Email us. | Write to chiragaroradev@gmail.com. |

---

## 10. Closing call to action (bottom of the page)

- Title: Put a guard on your door today.
- Body: Create a free account in under a minute and see how safe and simple it feels.
- Buttons: Create your free account / Talk to us
- Under the buttons: the hero's reassurance line.
- Contact line: Questions? Write to chiragaroradev@gmail.com

---

## 11. Share message (WhatsApp, LinkedIn, email)

**English**

> Every sign-in is a door. Is yours guarded?
>
> Meet CKAuth, your website's security guard:
> - Confirms every new account by email
> - Blocks repeated password guesses, like an ATM PIN
> - Stores passwords so nobody can read them, not even us
> - Sends one-time links that expire, like an OTP
>
> Free during early access, no card required.
> https://ckauth.chiragdev.com
