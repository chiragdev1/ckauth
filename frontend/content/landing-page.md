# CKAuth landing page copy (English + हिंदी)

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
10. **Familiar comparisons:** bank locker, ATM PIN, OTP. Prices stay in ₹. Hindi uses everyday Hinglish words (login, password, email, link).
11. **Only promise what CKAuth does today.** There's no SMS/WhatsApp OTP and no Google login yet, so don't mention them. There's also no no-code way to connect a website yet: today a developer adds CKAuth by following the README, so never say coding isn't needed until the dashboard can connect a site. CKAuth is free during early access. The paid plans are placeholders, so the page must say clearly that they haven't started.

### Written to convert

The page has one job: turn a visit into a sign-up.
- **One primary action, everywhere:** "Create your free account" in the hero, the pricing card and the closing section; "Get started free" in the header. Specific button text ("your free account") beats generic ("Try it").
- **The hero's second button stays on the page** ("See how it works" scrolls down). Links that leave the page (GitHub, email) only appear further down.
- **Screen-reader and control labels** (not visible): skip link EN: Skip to content · HI: सीधे मुख्य हिस्से पर जाएँ; ticker pause button EN: Pause the moving strip · HI: चलती पट्टी रोकें.
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

| | English | हिंदी |
|---|---|---|
| Title (50–60 chars) | Secure Sign-In and User Accounts for Your Website · CKAuth | आपकी वेबसाइट के लिए सुरक्षित साइन-इन और अकाउंट · CKAuth |
| Description (140–160 chars) | Protect every account on your website with CKAuth: email-confirmed sign-ups, passwords no one can read and blocked guessing. Free, no card. Get started now. | अपनी वेबसाइट के हर अकाउंट को सुरक्षित रखें: ईमेल से पक्का साइन-अप, ऐसे पासवर्ड जिन्हें कोई पढ़ न सके, और अंदाज़े पर रोक। मुफ़्त, कार्ड नहीं। आज ही शुरू करें। |

---

## 2. Hero (top of the page)

| | English | हिंदी |
|---|---|---|
| Badge (the worry, named once) | Every sign-in is a door. Is yours guarded? | हर साइन-इन एक दरवाज़ा है। क्या आपके दरवाज़े पर पहरा है? |
| Headline | Meet CKAuth, **your website's security guard.** | मिलिए CKAuth से, **आपकी वेबसाइट का सुरक्षा गार्ड।** |
| Sub-headline | It confirms every new account, stops anyone guessing passwords, and keeps watch day and night. You build what matters. CKAuth guards the door. | यह हर नए अकाउंट को पक्का करता है, पासवर्ड का अंदाज़ा लगाने वालों को रोकता है, और दिन-रात पहरा देता है। आप अपना काम कीजिए, दरवाज़ा CKAuth संभालेगा। |
| Primary button | Create your free account | मुफ़्त अकाउंट बनाएँ |
| Secondary button (scrolls to How it works) | See how it works | देखें कैसे काम करता है |
| Reassurance (under the buttons) | Free during early access · No card required · Ready in under a minute | शुरुआती दौर में मुफ़्त · कार्ड की ज़रूरत नहीं · एक मिनट से कम में तैयार |

**Hero picture:** a demo sign-in screen for `yourwebsite.com` with three ticks under it: Email confirmed, Password stored unreadable, Repeated guesses blocked. Caption: "What your users see. What CKAuth checks." / "आपके यूज़र यह देखते हैं। CKAuth यह जाँचता है।"

**Real numbers (stats row)**

| Value | EN label | HI label |
|---|---|---|
| 1 min | to create an account | में अकाउंट तैयार |
| 15 min | and every email link expires | में हर ईमेल लिंक बंद |
| 0 | people who can read a password, not even us | लोग पासवर्ड पढ़ सकते हैं, हम भी नहीं |

---

## 3. Moving strip (ticker)

- EN: Email-confirmed accounts ✦ Password-guessing protection ✦ Unreadable passwords ✦ One-time links ✦ A private user list ✦ Verified image uploads ✦ Works on every device
- HI: ईमेल से पक्के अकाउंट ✦ पासवर्ड के अंदाज़े पर रोक ✦ पासवर्ड कोई पढ़ नहीं सकता ✦ एक बार चलने वाले लिंक ✦ यूज़र्स की लिस्ट निजी ✦ जाँची हुई फ़ोटो ✦ हर डिवाइस पर चलता है

---

## 4. What your guard does

- Eyebrow: EN: On duty, around the clock · HI: हर घड़ी ड्यूटी पर
- Title: EN: A guard that never takes a day off · HI: ऐसा गार्ड जो कभी छुट्टी नहीं लेता
- Body: EN: Attackers look for the one door nobody is watching. CKAuth watches every door, every time. · HI: हमलावर वही दरवाज़ा ढूँढते हैं जिस पर किसी की नज़र न हो। CKAuth हर दरवाज़े पर हमेशा नज़र रखता है।

| EN heading | EN text | HI heading | HI text |
|---|---|---|---|
| Checks every new account at the door | No account opens until its owner proves the email is theirs. Fake and mistyped addresses stay out. | हर नए अकाउंट को दरवाज़े पर जाँचता है | जब तक मालिक साबित न करे कि ईमेल उसका है, अकाउंट नहीं खुलता। नकली और गलत ईमेल बाहर रहते हैं। |
| Stops anyone guessing passwords | Like an ATM after too many wrong PINs, CKAuth blocks repeated wrong tries, even when the attacker keeps switching networks. | पासवर्ड का अंदाज़ा लगाने वालों को रोकता है | जैसे ATM बार-बार गलत PIN पर रुक जाता है, वैसे ही CKAuth गलत कोशिशें रोक देता है, चाहे हमलावर नेटवर्क बदलता रहे। |
| Locks passwords away, even from us | Passwords are stored as a one-way code, like valuables in a bank locker. Stolen data is useless to a thief. | पासवर्ड तिजोरी में रखता है, हमसे भी दूर | पासवर्ड एकतरफ़ा कोड में रखे जाते हैं, जैसे बैंक लॉकर में कीमती सामान। चोरी हुआ डेटा चोर के किसी काम का नहीं। |
| Sends links that work only once | Every email link works one time and expires after 15 minutes, just like an OTP. | एक बार चलने वाले लिंक भेजता है | हर ईमेल लिंक सिर्फ़ एक बार चलता है और 15 मिनट में बंद हो जाता है, बिल्कुल OTP की तरह। |
| Keeps your user list private | Nobody can find out who has an account. Everyone gets the same answer. | यूज़र्स की लिस्ट निजी रखता है | कोई पता नहीं लगा सकता कि किसका अकाउंट है। सबको एक जैसा जवाब मिलता है। |
| Signs out lost devices for you | When someone changes or resets their password, every other phone and computer is signed out. | खोए डिवाइस से अपने-आप साइन-आउट | कोई पासवर्ड बदले या रीसेट करे, तो बाकी सभी फ़ोन और कंप्यूटर साइन-आउट हो जाते हैं। |

---

## 5. One simple path

- Eyebrow: EN: How it works · HI: यह कैसे काम करता है
- Title: EN: Sign up. Confirm. Stay safe. · HI: साइन-अप करें। पक्का करें। सुरक्षित रहें।
- Body: EN: No passwords in emails, no codes to copy, no guessing what comes next. · HI: ईमेल में कोई पासवर्ड नहीं, कोई कोड कॉपी नहीं, कोई उलझन नहीं।

| # | EN title | EN text | HI title | HI text |
|---|---|---|---|---|
| 1 | Sign up | Name, email, password. A meter shows how strong the password is. | साइन-अप करें | नाम, ईमेल, पासवर्ड। मीटर बताता है कि पासवर्ड कितना मज़बूत है। |
| 2 | Confirm your email | Open the link we send and enter your password once more. You're in. | ईमेल पक्का करें | भेजा गया लिंक खोलें और पासवर्ड एक बार फिर डालें। आप अंदर हैं। |
| 3 | Stay signed in, safely | No sign-in on every visit. CKAuth quietly checks it's still you. | सुरक्षित साइन-इन रहें | हर बार साइन-इन नहीं। CKAuth चुपचाप जाँचता रहता है कि यह आप ही हैं। |
| 4 | Forgot your password? | A reset link by email, and you're back in a minute. | पासवर्ड भूल गए? | ईमेल पर रीसेट लिंक, और एक मिनट में वापस अंदर। |

---

## 6. Why it matters

- Eyebrow: EN: Why it matters · HI: यह क्यों ज़रूरी है
- Title: EN: Big-company security. No security team needed. · HI: बड़ी कंपनियों जैसी सुरक्षा। सिक्योरिटी टीम की ज़रूरत नहीं।
- Body: EN: One break-in can undo years of trust. Whether you run a shop, a clinic, a startup or a community, CKAuth on your sign-in helps you keep that trust. · HI: एक सेंध सालों का भरोसा तोड़ सकती है। आप दुकान चलाएँ, क्लिनिक, स्टार्टअप या कोई कम्युनिटी, आपके साइन-इन पर CKAuth वह भरोसा बनाए रखने में मदद करता है।

| EN title | EN text | HI title | HI text |
|---|---|---|---|
| Fewer support requests | People reset their own passwords and update their own photo. | सपोर्ट की कम ज़रूरत | लोग अपना पासवर्ड और फ़ोटो खुद बदल लेते हैं। |
| Users who trust you | A safe, smooth sign-in looks professional. People stay where they feel safe. | भरोसा करने वाले यूज़र | सुरक्षित और आसान साइन-इन प्रोफ़ेशनल लगता है। लोग वहीं टिकते हैं जहाँ सुरक्षित महसूस करें। |
| Nobody can pose as your users | Signing up with someone else's email gets an impostor nothing. They'd need the inbox and the password. | कोई आपके यूज़र का रूप नहीं ले सकता | किसी और के ईमेल से साइन-अप करके धोखेबाज़ को कुछ नहीं मिलता। उसे ईमेल और पासवर्ड, दोनों चाहिए। |
| Only real images get in | Every profile photo is checked, so harmful files disguised as pictures are blocked. | सिर्फ़ असली फ़ोटो | हर प्रोफ़ाइल फ़ोटो जाँची जाती है, फ़ोटो के भेस में आई खतरनाक फ़ाइलें रुक जाती हैं। |

---

## 7. For developers (the second way in)

- Eyebrow: EN: Building for clients, or for yourself? · HI: क्लाइंट्स के लिए बनाते हैं, या अपने लिए?
- Title: EN: Give every project the same strong lock. · HI: हर प्रोजेक्ट को वही मज़बूत ताला दीजिए।
- Body: EN: CKAuth is open source on GitHub, and its README walks through setup. Set it up once, and use it on every site you build. · HI: CKAuth ओपन सोर्स है और GitHub पर है, README में सेटअप समझाया गया है। एक बार सेट करें, हर वेबसाइट पर इस्तेमाल करें।
- Button: EN: View the code on GitHub · HI: GitHub पर कोड देखें

---

## 8. Pricing (placeholder plans; CKAuth is free during early access)

- Eyebrow: EN: Pricing · HI: कीमत
- Title: EN: Simple pricing. Free while we launch. · HI: सीधी-सादी कीमत। लॉन्च तक मुफ़्त।
- Body: EN: Every plan includes the full security guard. Pay only when you grow. · HI: हर प्लान में पूरा सुरक्षा गार्ड। पैसे तभी, जब आप आगे बढ़ें।
- Banner (above the cards): EN: Early access: every feature is free today. Paid plans have not started yet. · HI: शुरुआती दौर: आज हर सुविधा मुफ़्त है। पेड प्लान अभी शुरू नहीं हुए हैं।

| | Free | Monthly | Yearly |
|---|---|---|---|
| Price (EN / HI) | ₹0 | ₹99 / month · ₹99 / महीना | ₹999 / year · ₹999 / साल |
| Tagline (EN) | To get started | For growing teams | Best value: save ₹189 |
| Tagline (HI) | शुरुआत के लिए | बढ़ती टीमों के लिए | सबसे फ़ायदेमंद: ₹189 की बचत |
| Includes (EN) | All security features · Email confirmation for every user · Password reset by email | Everything in Free · Priority email support · Your brand name on sign-in emails | Everything in Monthly · About two months free · Early access to new features |
| Includes (HI) | सारी सुरक्षा सुविधाएँ · हर यूज़र का ईमेल पक्का · ईमेल से पासवर्ड रीसेट | Free की सारी सुविधाएँ · ईमेल पर जल्दी मदद · साइन-इन ईमेल पर आपके ब्रांड का नाम | Monthly की सारी सुविधाएँ · लगभग दो महीने मुफ़्त · नई सुविधाएँ सबसे पहले |
| Button (EN / HI) | Start free · मुफ़्त शुरू करें | Coming soon · जल्द आ रहा है | Coming soon · जल्द आ रहा है |

Notes on the placeholder plans:
- ₹99 × 12 = ₹1,188, so the yearly plan saves ₹189 (about 16%, close to two months free).
- The paid plans list **features CKAuth doesn't have yet** (priority support, your brand on emails, early access). Keep "Coming soon" on those buttons and the banner until the features exist.
- Highlight the first plan people can actually pick (Free today), labelled "Available now" · "अभी उपलब्ध". Highlighting a "Coming soon" plan makes the loudest card a dead end. The yearly card's tagline still says it's the best value.

---

## 9. Good to know (FAQ)

Each answer starts with a short reply in bold, then the detail. On the page, the answer sits in a faint bubble under the question.

| EN question | EN short answer | EN detail | HI question | HI short answer | HI detail |
|---|---|---|---|---|---|
| Who is CKAuth for? | Anyone with users to protect. | Online shops, clinics, tutors, startups, communities and side projects: if people sign in, CKAuth keeps their accounts safe. | CKAuth किसके लिए है? | हर उस व्यक्ति के लिए जिसके यूज़र हैं। | ऑनलाइन दुकान, क्लिनिक, ट्यूटर, स्टार्टअप, कम्युनिटी या साइड प्रोजेक्ट: जहाँ लोग साइन-इन करते हैं, CKAuth उनके अकाउंट सुरक्षित रखता है। |
| Do I need to know how to code? | Today, a developer sets it up. | CKAuth is open source, and a developer can add it to your website by following its README. A no-code way to connect your website is on the way. Until then, you can create an account and try the sign-in your users would see. | क्या मुझे कोडिंग आनी चाहिए? | अभी इसे कोई डेवलपर सेट करता है। | CKAuth ओपन सोर्स है, और कोई भी डेवलपर README देखकर इसे आपकी वेबसाइट पर लगा सकता है। बिना कोड के वेबसाइट जोड़ने का तरीका जल्द आ रहा है। तब तक आप अकाउंट बनाकर वही साइन-इन आज़मा सकते हैं जो आपके यूज़र्स देखेंगे। |
| Can you see my users' passwords? | No, never. | They're stored as a one-way code that nobody can read, including us. | क्या आप मेरे यूज़र्स के पासवर्ड देख सकते हैं? | नहीं, कभी नहीं। | वे एकतरफ़ा कोड में रखे जाते हैं जिसे कोई नहीं पढ़ सकता, हम भी नहीं। |
| What do you do with my data? | Only what the service needs. | No ads, no tracking, and we never sell it. *Link:* Read the Privacy Policy | आप मेरे डेटा का क्या करते हैं? | सिर्फ़ उतना, जितना सेवा के लिए ज़रूरी है। | न विज्ञापन, न ट्रैकिंग, और हम इसे कभी नहीं बेचते। *लिंक:* प्राइवेसी पॉलिसी पढ़ें |
| What if someone forgets their password? | They fix it themselves. | An email link lets them choose a new one. No support ticket needed. | अगर कोई पासवर्ड भूल जाए तो? | वह खुद ठीक कर लेता है। | ईमेल लिंक से नया पासवर्ड चुन सकता है। सपोर्ट की ज़रूरत नहीं। |
| What if someone loses their phone? | Change the password. | Every other phone and computer is signed out at once. | अगर किसी का फ़ोन खो जाए तो? | पासवर्ड बदल दें। | बाकी सभी फ़ोन और कंप्यूटर तुरंत साइन-आउट हो जाते हैं। |
| How much does it cost? | Free during early access. | Paid plans will start later at ₹99/month or ₹999/year, and there will always be a free plan. | इसकी कीमत क्या है? | शुरुआती दौर में मुफ़्त। | पेड प्लान बाद में ₹99/महीना या ₹999/साल से शुरू होंगे, और मुफ़्त प्लान हमेशा रहेगा। |
| How do I get help? | Email us. | Write to chiragaroradev@gmail.com. | मदद कैसे मिलेगी? | हमें ईमेल करें। | chiragaroradev@gmail.com पर लिखें। |

---

## 10. Closing call to action (bottom of the page)

- Title: EN: Put a guard on your door today. · HI: आज ही अपने दरवाज़े पर पहरा लगाइए।
- Body: EN: Create a free account in under a minute and see how safe and simple it feels. · HI: एक मिनट से कम में मुफ़्त अकाउंट बनाएँ और खुद देखें कि यह कितना आसान और सुरक्षित है।
- Buttons: EN: Create your free account / Talk to us · HI: मुफ़्त अकाउंट बनाएँ / हमसे बात करें ("Talk to us" opens mailto:chiragaroradev@gmail.com)
- Under the buttons: the hero's reassurance line.
- Contact line: EN: Questions? Write to chiragaroradev@gmail.com · HI: कोई सवाल? chiragaroradev@gmail.com पर लिखें

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

**हिंदी**

> हर साइन-इन एक दरवाज़ा है। क्या आपके दरवाज़े पर पहरा है?
>
> मिलिए CKAuth से, आपकी वेबसाइट का सुरक्षा गार्ड:
> - हर नए अकाउंट को ईमेल से पक्का करता है
> - ATM PIN की तरह, बार-बार गलत पासवर्ड की कोशिशें रोकता है
> - पासवर्ड ऐसे रखता है कि कोई पढ़ न सके, हम भी नहीं
> - OTP की तरह, एक बार चलने वाले लिंक भेजता है
>
> शुरुआती दौर में मुफ़्त, कार्ड की ज़रूरत नहीं।
> https://ckauth.chiragdev.com
