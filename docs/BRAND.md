# CKAuth brand guide

How CKAuth looks and sounds, and where every brand file lives. Use it when you make a page, an email, a post or an image, so they all read as one product. Terms are explained on first use; the rest are in the [glossary](GLOSSARY.md).

## Contents

- [The idea](#the-idea)
- [Name](#name)
- [The crest](#the-crest)
- [Colours](#colours)
- [Type](#type)
- [Voice and taglines](#voice-and-taglines)
- [Imagery](#imagery)
- [Brand files](#brand-files)
- [Changing an image](#changing-an-image)
- [Emails](#emails)
- [Don'ts](#donts)

---

## The idea

**CKAuth is your website's security guard.** It stands at the door (sign-in), checks who comes in (email-confirmed sign-ups), stops people forcing their way in (blocked password guessing) and tells you when someone new arrives (new-device alerts). Everything in the brand comes back to that picture: calm, watchful and on your side. It never tries to scare you.

## Name

- Write it **CKAuth**: one word, with capital C, K and A.
- Never write *CK Auth*, *Ckauth*, *CKauth* or *CK-Auth*. All capitals (*CKAUTH*) is only for a design element that sets every word in capitals, never in a sentence.
- The **wordmark** (the name set as a logo) is "CKAuth" in Inter Bold, beside the crest.

## The crest

A shield with a guard tower on top and a keyhole in it: protection, someone on watch, and the door they guard. The one source is `frontend/public/favicon.svg` (a 32 × 32 drawing). Every other copy is that same shape.

- **Colours:** the shield and keyhole are the primary colour (ember). The tower and body cut-out take the background's colour in the brand images, so the crest works on any background; in `favicon.svg` they're a fixed cream (`#fff7ed`), because a browser tab can be any colour.
- **Smallest size:** 16 px (a browser tab). Below 24 px, leave out the wordmark and use the crest alone.
- **Clear space:** keep at least half the crest's width empty around it.
- **Next to the wordmark:** the crest is about 1.6 × the height of the capital letters, and the gap between them is about a quarter of the crest's width.

## Colours

The colours are tokens (named values) in `frontend/src/index.css`. Every brand image copies these values, so change them there first.

| Token | Day | Night | Use |
|---|---|---|---|
| `--background` | `#f7f8fb` | `#0a0f1c` | Page background |
| `--foreground` | `#0f172a` | `#e8ecf4` | Headings and body text |
| `--primary` (ember) | `#c2410c` | `#fb7a3c` | Anything that acts: buttons, links, the crest, the accented word |
| `--card` | `#ffffff` | `#111827` | Cards and panels |
| `--muted-foreground` | `#4b5568` | `#9aa6ba` | Secondary text, like the address under a headline |
| `--border` | `#e2e6ee` | `#1f2a3d` | Lines and card edges |

Rules:
- **One ember accent per view.** Ember marks what acts or what matters most. If everything is orange, nothing stands out.
- **Text keeps full contrast.** Never fade text with an opacity modifier (`text-foreground/70`); use `--muted-foreground`. Both themes pass WCAG AA, the accessibility standard for contrast.
- Day ember is darker than night ember on purpose: `#fb7a3c` on white would fail contrast.

## Type

- **Inter Variable** for everything on the site and in brand images: 800 for big headlines, 700 for titles and the wordmark, 500–600 for labels, 400 for body text. Headlines are tracked slightly tight (`letter-spacing` about −2%).
- **Noto Sans Devanagari** for Hindi, bundled with the site.
- **Emails use the system font stack** (`-apple-system, Segoe UI, Roboto…`), because most email apps can't load web fonts.

## Voice and taglines

CKAuth talks like a calm member of your team. The full rules and every line of the landing page are in [`frontend/content/landing-page.md`](../frontend/content/landing-page.md). In short:

- Short sentences, mostly under 15 words. Headings often start with what CKAuth does for you: *Checks…, Stops…, Keeps…*
- Name the worry once, then reassure. No fear, no emoji, no slang.
- Speak to "your website" and "your users", with a range of examples (a shop, a clinic, a startup, a community).
- **Only promise what ships today.** No made-up customers, numbers or features.

| Line | Where |
|---|---|
| **Every sign-in, guarded.** | The tagline: brand images, social profiles, anywhere with little room |
| **Meet CKAuth, your website's security guard.** | The landing-page hero, where there's room to introduce it |
| **You build what matters. CKAuth guards the door.** | Supporting line under a headline |
| Email-confirmed sign-ups · Password guessing blocked · New-device alerts | The three proof points, always in this order |

## Imagery

- **No illustrations or stock art.** Pictures show the product itself: a sign-in card, an alert, drawn from simple shapes in the real colours and real copy.
- **Backdrops are CSS or SVG only:** the faint square grid and one soft ember glow, in a corner or behind the crest.
- Anything themed must be original. Never borrow another product's look, mascot or art.
- Icons come from [lucide](https://lucide.dev) (the set the site uses), drawn with rounded 2 px strokes.

## Brand files

Every image is rendered from an SVG source by `pnpm brand:images` (`scripts/brand-images.mjs`), in dark and/or light.

| File | Size | Source | Where it's used |
|---|---|---|---|
| `frontend/public/og.png` | 1200 × 630, dark | `frontend/og-image.svg` | Link previews (Slack, WhatsApp, X, LinkedIn). Dark only: a preview can't follow the reader's theme |
| `docs/brand/ckauth-dark.png`, `ckauth-light.png` | 1280 × 640 | `frontend/og-image.svg` | The README banner (follows GitHub's theme); the dark one is GitHub's social preview |
| `frontend/public/apple-touch-icon.png` | 180 × 180 | `frontend/brand/icon.svg` | iPhone and iPad "Add to Home Screen" |
| `frontend/public/icon-192.png`, `icon-512.png` | 192, 512 | `frontend/brand/icon.svg` | Android and Chrome, listed in `frontend/public/manifest.json` |
| `frontend/public/favicon.svg` | any | itself | The browser tab |
| `frontend/public/email/*.png` | 112 (logo 72) | `frontend/email-icons/*.svg` | Email icons (built by `frontend/scripts/email-icons.mjs`) |
| `docs/brand/social/avatar-{dark,light}.png` | 400 × 400 | `frontend/brand/icon.svg` | Profile photo on X, LinkedIn, GitHub |
| `docs/brand/social/x-header-{dark,light}.png` | 1500 × 500 | `frontend/brand/social-header.svg` | X profile header |
| `docs/brand/social/linkedin-banner-{dark,light}.png` | 1584 × 396 | `frontend/brand/social-header.svg` | LinkedIn page or profile banner |

**Uploading by hand** (no file in the repo can set these):
- **GitHub social preview:** repository Settings → General → Social preview → upload `docs/brand/ckauth-dark.png`.
- **X:** Edit profile → header `x-header-dark.png`, photo `avatar-dark.png`.
- **LinkedIn:** the banner and logo on the page or profile.

The icon is **full-bleed** (the background fills the whole square), because iOS, Android and social sites cut their own shape: a rounded square or a circle. The crest stays inside the centre 80% circle, the **safe zone** of a *maskable* icon, so no shape cuts into it. The social header leaves its left third empty because X and LinkedIn put the profile photo there.

## Changing an image

1. Edit the SVG source. Each one holds both themes as CSS variables at the top. `class="light"` on the `<svg>` switches to day, which the renderer does for you.
2. Run `pnpm brand:images`. It renders in Chromium (through the Playwright install the browser tests use), with Inter embedded so every machine gives the same result.
3. Commit the SVG and the PNGs together.

`pnpm build` in `frontend/` then checks (`scripts/check-dist.js`) that `og.png` and the app icons were rendered from the current sources. Each PNG stores the **SHA-256** (a fingerprint) of its SVG in a small text chunk inside the file; if the SVG changed and the PNG didn't, the build fails and names the file. File dates can't do this job, because a git checkout resets them.

A new headline on the landing page usually means a new line in `og-image.svg` and `social-header.svg` too (the `/ship` skill reminds you).

## Emails

Emails share one layout (`src/utils/email-layout.ts`) in the "spotlight" design: a tinted top with a big centred icon, then the message and a pill button. The colour theme is **midnight**, the site's own slate and ember:

| | Day | Night |
|---|---|---|
| Page | `#eef1f6` | `#070b14` |
| Card | `#ffffff` | `#111827` (the site's `--card`) |
| Headings / body | `#0f172a` / `#334155` | `#f1f5f9` / `#cbd5e1` |
| Links and buttons | `#c2410c` | `#fb923c` |

Ember marks the brand and red marks security warnings, as on the site. Midnight was picked on 6 Nov 2026 over *ember* (a cool grey page) and *warm* (cream paper), because an email that uses the site's colours looks like the same product; warm also didn't match the navy site. A test (`test/emails.test.ts`) keeps the emails on the site's colours. To try another theme, add it to `emailThemes` and compare it on the dev-only `/dev/emails` page.

## Don'ts

- Don't stretch, rotate, outline or add shadows to the crest, and don't put it on a busy photo.
- Don't use ember for large areas of text or for backgrounds. It's an accent.
- Don't add a second accent colour. Red is only for errors and security warnings.
- Don't write claims the product can't back: no customer counts, logos or testimonials until they're real.
- Don't edit a PNG by hand. Change its SVG and render it again.
