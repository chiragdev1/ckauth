# SEO and traffic audit

Strict audit of `ckauth.chiragdev.com` on **21 Oct 2026**: 64 pass/fail tests across seven weighted categories, run against the live site and the build that added prerendering (see DEVLOG, "SEO"). Interactive version: https://claude.ai/artifact/MQQ63c5zJywVQqwcsCznbF (private until shared).

A test passes only if it meets its threshold outright; there is no partial credit. Thresholds are stricter than Google's on purpose: LCP 1.8 s rather than 2.5 s, FCP 1.5 s rather than 1.8 s, CLS 0.02 rather than 0.1, and 100 rather than "good" where Lighthouse scores a category.

## How to read this audit

- **What it measures.** How easily people can find the site through search and shared links, and whether it's fast, accessible and trustworthy once they arrive. *SEO* (search engine optimisation) is the part about search.
- **Two targets.** *Live site* is what runs at `ckauth.chiragdev.com` today. *This build* is the version with the SEO changes, not yet deployed.
- **Test IDs.** Each test has an ID such as `C05`. The letter is the category (C crawlability, O on-page, P performance, A accessibility, B best practice and security, D domain trust, M measurement). DEVLOG's "Next up" uses the same IDs.
- **"Quick".** A fix small enough for phase 1 of the plan, roughly two weeks.
- **Scores.** Each category's score is the share of its tests that pass. The overall score combines the categories by weight, so crawlability counts twice as much as accessibility.
- **Terms.** Unfamiliar words (LCP, canonical, DMARC…) are defined in the [glossary](GLOSSARY.md).

## Scores

| | Score | Grade |
|---|---|---|
| Live site (before this build) | 14 / 100 | F |
| This build, once deployed | 33 / 100 | F |
| After phase 1 (quick fixes, about two weeks) | 80 / 100 | B |

Grades: A 90+, B 75+, C 60+, D 45+, otherwise F. The overall score is each category's share of tests passed, times its weight.

| Category | Weight | Tests | Live | This build | After phase 1 |
|---|---|---|---|---|---|
| Crawlability | 20 | 12 | 8% | 67% | 100% |
| On-page | 20 | 11 | 0% | 36% | 91% |
| Performance | 15 | 12 | 33% | 33% | 50% |
| Accessibility | 10 | 6 | 33% | 33% | 100% |
| Security & practice | 10 | 8 | 25% | 25% | 75% |
| Domain trust | 15 | 9 | 11% | 11% | 44% |
| Measurement & reach | 10 | 6 | 0% | 0% | 100% |

**Verdict.** The site is engineered well (Lighthouse 96–100, HTTP/3, TLS 1.3, sound caching). Traffic is held back by a brand-new domain with a parked root page and no links, a single indexable page, a brand name shared with an IBM AIX command, and no measurement at all. Code can take the score to about 80; the rest is age and links, which only time and content move.

## Lighthouse runs

Lighthouse 12, headless Chrome 156; mobile uses simulated slow 4G.

| Run | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| Live site Mobile | 96 | 96 | 96 | 91 | 2.2 s | 2.2 s | 0 ms | 0 |
| Live site Desktop | 100 | 96 | 96 | 91 | 0.5 s | 0.5 s | 0 ms | 0.001 |
| This build Mobile | 97 | 96 | 96 | 100 | 1.8 s | 2.4 s | 10 ms | 0.001 |
| This build Desktop | 100 | 96 | 96 | 100 | 0.4 s | 0.5 s | 0 ms | 0.001 |

## Tests

"Quick" means the fix fits in phase 1.

### Crawlability

Can search engines fetch the pages, understand which ones matter, and add them to their index?

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| C01 | robots.txt is a real text file | 200, text/plain, valid rules | ❌ | ✅ | Live: the app HTML with a 200. Build: real file | Done in this build | no |
| C02 | XML sitemap of indexable pages | Valid XML, only 200 + indexable URLs | ❌ | ✅ | Live: the app HTML. Build: home only | Done in this build | no |
| C03 | Unknown URLs return 404 | A made-up path answers 404 | ❌ | ✅ | Live: /this-does-not-exist → 200. Build: 404 | Done in this build | no |
| C04 | App screens kept out of search | noindex on sign-in, reset, dashboard… | ❌ | ✅ | Build: X-Robots-Tag: noindex | Done in this build | no |
| C05 | Content is in the HTML without JavaScript | 300+ words in the raw HTML | ❌ | ✅ | Live: 0 words (empty root). Build: 645 words | Done in this build | no |
| C06 | Self-referencing canonical URL | Absolute https canonical on / | ❌ | ✅ | Build: https://ckauth.chiragdev.com/ | Done in this build | no |
| C07 | One URL per page | /index.html redirects to / | ❌ | ❌ | /index.html answers 200 (canonical softens it) | Caddy: redir /index.html / 301 | yes |
| C08 | HTTP to HTTPS in one permanent hop | One 301/308 | ✅ | ✅ | 308 to https://ckauth.chiragdev.com/ | None needed | no |
| C09 | Lighthouse SEO score is 100 | 100 on mobile | ❌ | ✅ | Live 91 (robots.txt invalid). Build 100 | Done in this build | no |
| C10 | Home page indexed by Google | Shows for a site: search | ❌ | ❌ | Not found in search; domain is 0 days old | Deploy, then request indexing in Search Console | yes |
| C11 | Search Console and Bing verified | Both verified, sitemap submitted | ❌ | ❌ | Not set up | DNS TXT records on chiragdev.com; submit sitemap | yes |
| C12 | IndexNow ping on deploy | Bing/Yandex told on every web deploy | ❌ | ❌ | Not set up | Key file in public/, one curl in deploy.sh | yes |

### On-page

Once a page is fetched, does it clearly say what it's about, in the title, headings, text and preview tags?

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| O01 | Search title | 50–60 characters, topic words first | ❌ | ✅ | Live: 30 characters, no topic word. Fixed 23 Oct: "Secure Email & Password Authentication Demo · CKAuth" (52) | Deploy; not yet counted in the scores above | yes |
| O02 | Meta description | 140–160 characters, topic word and a call to action | ❌ | ✅ | Live: 101 characters, no topic word. Fixed 23 Oct: 151 characters, topic first, ends "Try it live." | Deploy; not yet counted in the scores above | yes |
| O03 | One h1 that names the topic | Exactly one h1 that says what the page is | ❌ | ❌ | Live: no h1 without JS. Build: h1 without topic words | Add "authentication" to the h1 or the line right under it | yes |
| O04 | Heading levels never skip | h1 → h2 → h3 in order | ❌ | ✅ | Build: 1, 2, 3, 3, 3, 2 … in order | Done in this build | no |
| O05 | Enough copy on the landing page | 600+ unique words in the HTML | ❌ | ✅ | Live 0, build 645 (just over) | Done; grows with content pages | no |
| O06 | Pages for distinct search intents | 5+ indexable pages | ❌ | ❌ | 1 indexable page | Docs and articles (plan, phase 2) | no |
| O07 | Open Graph and Twitter card | All tags plus a 1200×630 image | ❌ | ✅ | Build: complete, og.png 1200×630 | Done in this build | no |
| O08 | Structured data names the owner | WebSite + Person/Organization with logo and sameAs | ❌ | ❌ | Build: WebSite + WebApplication only | Add Person (you) with sameAs to GitHub and LinkedIn | yes |
| O09 | Complete icon set | SVG, 48px-multiple PNG, 180px apple-touch-icon, manifest | ❌ | ❌ | SVG favicon only | Render PNGs from the crest; add site.webmanifest | yes |
| O10 | Crawlable internal links | <a href> links in the HTML | ❌ | ✅ | Build: links to /sign-up, /sign-in, /forgot-password | Done in this build | no |
| O11 | Links out to source and docs | Links to GitHub and the API reference | ❌ | ❌ | No outbound links | Footer links to the repo and docs/API.md | yes |

### Performance

How quickly the page appears and becomes usable, especially on a phone over a slow connection. Google uses speed as a ranking signal, and slow pages lose visitors.

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| P01 | Lighthouse performance, mobile | 95 or more | ✅ | ✅ | Live 96, build 97 | None needed | no |
| P02 | Largest Contentful Paint, mobile lab | 1.8 s or less | ❌ | ❌ | Live 2.2 s. 23 Oct build: 2.1–2.3 s, render delay ~800 → ~100 ms (no more fade) | Smaller first-screen font load; CDN (P09) | yes |
| P03 | First Contentful Paint, mobile lab | 1.5 s or less | ❌ | ❌ | Live 2.2 s. 23 Oct build: 1.5–1.7 s with CSS and theme script inlined | CDN (P09) | no |
| P04 | Total Blocking Time | 50 ms or less | ✅ | ✅ | Live 0 ms, build 10 ms | None needed | no |
| P05 | Cumulative Layout Shift | 0.02 or less | ✅ | ✅ | 0 and 0.001 | None needed | no |
| P06 | Initial JavaScript | 100 kB gzip or less | ❌ | ❌ | Live 150 KiB. 23 Oct build: 121 KiB (account menu lazy-loaded) | Lazy-load more of the router/UI code | no |
| P07 | Unused JavaScript on the landing page | 20 KiB or less | ❌ | ❌ | Live 79 KiB. 23 Oct build: 56 KiB | Same as P06 | no |
| P08 | No render-blocking resources | Nothing blocks first paint | ❌ | ✅ | Fixed 23 Oct: theme script inlined (CSP hash), home CSS inlined | Deploy | no |
| P09 | Server response time from a distance | TTFB 200 ms or less including TLS | ❌ | ❌ | 212–345 ms from this machine; one VPS, no CDN | Cloudflare in front (already in Next up) | no |
| P10 | Real-user Core Web Vitals | Field data exists and passes | ❌ | ❌ | No field data (too few Chrome visitors) | Comes with traffic; track in Search Console | no |
| P11 | Modern transport and caching | HTTP/2 + HTTP/3, compression, immutable assets | ✅ | ✅ | h2 + h3, zstd, 1-year immutable /assets | None needed | no |
| P12 | Reachable over IPv6 | AAAA record | ❌ | ❌ | No AAAA for ckauth or chiragdev.com | Add the VPS IPv6 address in DNS | yes |

### Accessibility

Can everyone use the page, including people using screen readers, keyboards only, or low-contrast screens?

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| A01 | Lighthouse accessibility score | 100 | ❌ | ✅ | Live 96. 23 Oct build: 100 | Deploy | yes |
| A02 | All text meets WCAG AA contrast | 4.5:1 for normal text | ❌ | ✅ | Live: 10 elements. Fixed 23 Oct: darker light `--primary`/`--success`, no opacity on text; lowest now 4.72:1 | Deploy | yes |
| A03 | Skip-to-content link | First focusable element skips to main | ❌ | ✅ | Fixed 27 Oct: "Skip to content" (English and Hindi) is the first focusable element in Layout | Deploy; not yet counted in the scores above | yes |
| A04 | Honours reduced motion | Animations off under prefers-reduced-motion | ✅ | ✅ | Global rule in index.css. 27 Oct: it now also stops infinite animations (the ticker flickered before), and the ticker has a pause button (WCAG 2.2.2) | None needed | no |
| A05 | Language and landmarks | lang, header, nav, main, footer | ✅ | ✅ | All present | None needed | no |
| A06 | Hero readable without waiting | No opacity-0 entrance on the main text | ❌ | ✅ | Fixed 23 Oct: slides in, never starts transparent | Deploy | yes |

### Security & practice

Does the site follow current security and quality standards? Browsers and search engines trust sites that do.

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| B01 | No console errors on an anonymous visit | 0 errors | ❌ | ❌ | 401 on /auth/me, then 401 on /auth/refresh | Skip the call without a session hint cookie, or answer 200 with no user | yes |
| B02 | Modern TLS | TLS 1.3, trusted cert, auto-renewal | ✅ | ✅ | TLS 1.3, Let's Encrypt, renews automatically | None needed | no |
| B03 | Full HSTS | includeSubDomains + preload listed | ❌ | ❌ | max-age only | After every chiragdev.com subdomain is HTTPS-only | no |
| B04 | CSP without unsafe-inline | No unsafe-inline anywhere | ❌ | ❌ | style-src has unsafe-inline | Needs Radix/Tailwind inline styles audited | no |
| B05 | Standard protective headers | nosniff, frame, referrer, permissions | ✅ | ✅ | All four set at the edge | None needed | no |
| B06 | CAA record | Only Let's Encrypt may issue | ❌ | ❌ | No CAA record | One DNS record: 0 issue "letsencrypt.org" | yes |
| B07 | Cross-origin isolation headers | COOP and CORP set | ❌ | ❌ | Not set | Two headers in ckauth.caddy | yes |
| B08 | Lighthouse best practices score | 100 | ❌ | ❌ | 96 on both (console errors) | Fix B01 | yes |

### Domain trust

How much search engines and email providers trust the domain: its age, the links pointing to it, and how its email is authenticated. This is the slowest category to improve.

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| D01 | Domain age | Older than 6 months | ❌ | ❌ | chiragdev.com registered 2026-10-21 (0 days) | Only time fixes this; start the clock with content now | no |
| D02 | Root domain has real content | chiragdev.com is not parked | ❌ | ❌ | Hostinger "Parked Domain" page | Put your portfolio on chiragdev.com, linking to CKAuth | yes |
| D03 | Referring domains | 10 or more | ❌ | ❌ | None found | Plan, phase 2 | no |
| D04 | Brand search finds the site | "CKAuth" shows it on page 1 | ❌ | ❌ | IBM AIX ckauth and CK.AspNet.Auth rank instead | Use "CKAuth authentication" together; time and links | no |
| D05 | GitHub repo points at the site | Homepage URL, description and topics set | ❌ | ❌ | Public, but no homepage, description or topics | Set them in the repo settings | yes |
| D06 | Sending domain authenticates | SPF and DKIM pass | ✅ | ✅ | DKIM at resend._domainkey.mail; SPF on send.mail | None needed | no |
| D07 | DMARC enforced with reports | p=quarantine or reject, with rua | ❌ | ❌ | p=none, no reports | Add rua now; enforce after 2–4 clean weeks | no |
| D08 | Registration secured ahead | 2+ years, auto-renew on | ❌ | ❌ | Expires 2027-10-21 | Extend registration, turn on auto-renew | yes |
| D09 | Brand name owns its results | No strong namesakes | ❌ | ❌ | Shares the name with an IBM AIX command | Keep the name; always pair it with "authentication" | no |

### Measurement & reach

Can we see who visits and where they come from, and are we actively telling people the site exists?

| ID | Test | Must reach | Live | Build | Measured | Fix | Quick |
|---|---|---|---|---|---|---|---|
| M01 | Analytics on the site | Privacy-friendly, cookieless | ❌ | ❌ | None | Self-host Umami or Plausible on the VPS (CSP-friendly) | yes |
| M02 | Sign-up funnel measured | Visit → sign-up → verified | ❌ | ❌ | Not measured | Count from the users table + analytics events | yes |
| M03 | Uptime monitoring with alerts | External check, alerts you | ❌ | ❌ | Deploy smoke test only | Free external monitor on / and /api/health | yes |
| M04 | Search performance reviewed | Monthly Search Console review | ❌ | ❌ | Not possible yet | Monthly: queries, pages, index coverage | yes |
| M05 | Launch posts and listings | Show HN, Reddit, dev.to, Product Hunt | ❌ | ❌ | None | Plan, phase 1 | yes |
| M06 | Social profiles linked | sameAs to GitHub, LinkedIn, X | ❌ | ❌ | None | With O08 | yes |

## Plan

Organic search will be slow whatever is done: the domain was registered on 21 Oct 2026, and Google is cautious with new domains for the first few months. So there are two tracks: fix everything in our control now, and start the clock on authority (content and links) at the same time.

### Phase 1: this fortnight, ship and get counted

1. ~~Write the title and description (O01, O02)~~ done 23 Oct in `frontend/index.html`; deploy it, and consider "authentication" in the h1 (O03). Now live in the page:
   - Title (52): `Secure Email & Password Authentication Demo · CKAuth`
   - Description (151): `Open-source auth for Express + TypeScript: verified email sign-up, rotating httpOnly JWT sessions, rate limits and no account enumeration. Try it live.`
2. Verify `chiragdev.com` in Google Search Console and Bing Webmaster Tools with DNS TXT records, submit the sitemap and request indexing (C10, C11). Add an IndexNow ping to `deploy/deploy.sh` (C12).
3. Replace the Hostinger parked page on `chiragdev.com` with a one-page portfolio that links to CKAuth (D02).
4. Show the hero text without the opacity-0 fade-in (P02, A06), darken the muted text tokens and drop `opacity-40`/`/70` on text (A02), add a skip link (A03).
5. Stop the two 401s on every anonymous visit (B01). Add a CAA record, an AAAA record, COOP/CORP headers and a `/index.html` → `/` redirect (B06, P12, B07, C07).
6. Set the GitHub repo's homepage, description and topics. Link the repo and API docs from the footer, add Person JSON-LD with `sameAs`, and render the PNG icon set and `site.webmanifest` (D05, O11, O08, O09).
7. Self-host Umami (cookieless, CSP-friendly) for analytics, add an external uptime check, count the sign-up funnel (M01–M03). Extend the domain registration to 2+ years with auto-renew (D08).
8. Launch once, with substance: Show HN ("I load-tested my auth API on a 2-core VPS"), r/node, r/webdev, dev.to, LinkedIn (M05).

### Phase 2: months 1–3, content from what we already learned

Head terms like "authentication" belong to Auth0, Clerk and Okta. The opening is the long tail developers search when stuck, and `DEVLOG.md` and `LEARNINGS.md` already hold the material. Publish on `chiragdev.com/blog`, so authority builds on our own root domain, and cross-post to dev.to and Hashnode with a canonical link back. Two a month, each linking to the live demo and the repo (D03).

- bcryptjs capped my Express API at 17 sign-ins a second
- A 44 ms timing gap told attackers who had an account
- Pre-account takeover, and why verifying asks for the password
- Refresh-token rotation in httpOnly cookies with Express 5
- The random 502: keep-alive timeouts behind Caddy
- sshd keeps the first value: hardening that didn't apply
- Soft 404s in single-page apps, fixed in Caddy

### Phase 3: months 3–12, authority and speed

- Turn `docs/API.md` into indexable docs pages on the site (O06).
- Put Cloudflare in front, for TTFB and the WAF already in DEVLOG's Next up (P09).
- Get the landing bundle under 100 kB gzip by keeping Radix out of the signed-out header (P06, P07); inline critical CSS (P03, P08).
- Get listed in awesome-express, awesome-nodejs and auth example lists; answer Stack Overflow questions where an article fits.
- Review Search Console monthly: which queries show us, which pages get impressions without clicks (M04).
- Once every `chiragdev.com` subdomain is HTTPS-only, add `includeSubDomains` and submit to the HSTS preload list (B03).

## Warming the domain

### For search

Search engines trust a domain for its history: how long it has existed, who links to it, and whether it shows real content consistently. Age can't be shortcut, but the time can be made to count.

- Make the root domain real now (D02). A parked page works against every subdomain.
- Get the first links from places we control: GitHub repo and profile, LinkedIn, dev.to and Hashnode profiles, CV. Weak alone, but they get the site discovered and crawled.
- Publish on a steady cadence; regularly updated sites get crawled, and indexed, sooner.
- Earn the strong links with the articles: an HN or Reddit post that lands, or a mention in a newsletter such as Node Weekly.
- Keep one name, and always write "CKAuth authentication" together, so the brand stops colliding with IBM's `ckauth` (D04, D09).

### For email

CKAuth sends verification and reset emails from `mail.chiragdev.com`. Gmail and Outlook distrust new sending domains, and if those emails land in spam, sign-ups never finish.

- SPF and DKIM already pass (D06). Add a DMARC report address (`rua`) now, keep `p=none` for two to four weeks, then move to `quarantine` once the reports are clean (D07).
- Register `mail.chiragdev.com` in Google Postmaster Tools to watch reputation and spam rate.
- Ramp up slowly: send to our own inboxes first (Gmail, Outlook, Yahoo), open them, and mark them "not spam" if needed.
- Keep complaints under 0.1% and bounces under 2%; the sign-up rate limits already stop most abuse.
- One consistent From name and address, plain links to `ckauth.chiragdev.com` (no shorteners), and a text part in every email.

## How this was measured

- **Live site:** curl from a developer machine for headers, status codes and timings (3 runs), `dig` and RDAP for DNS and domain age, web searches for brand and index presence.
- **This build:** served by the real `frontend/Caddyfile` (Caddy 2.10) behind a local stand-in for the edge proxy with the same compression and headers, but without TLS, so its server timings aren't comparable.
- **Lighthouse 12** on both, in headless Chrome 156. Google's PageSpeed API was out of quota, and there is no real-user (CrUX) data for the site yet anyway.
- **"After phase 1"** assumes every quick fix lands. Indexing (C10) depends on Google and can take a few weeks.

To re-run: repeat the Lighthouse runs and the `curl -sI` checks per test, update the ✅/❌ marks, and recompute the category shares.
