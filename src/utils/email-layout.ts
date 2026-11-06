import { getFrontendUrl } from "../app/auth/utils/constants.js"

// every email is one of these: the words live in emails.ts, the look lives here, so a design change touches one file
export type EmailContent = {
  // which picture heads the mail: frontend/public/email/<icon>.png, built by frontend/scripts/email-icons.mjs
  icon: EmailIcon
  // ember for the brand, red for a security warning, slate for a plain notice; colours the accents around the icon
  tone: 'brand' | 'alert' | 'neutral'
  title: string
  preheader: string
  greeting: string
  paragraphs: string[]
  // a numbered list, e.g. first steps in the welcome mail
  steps?: string[]
  button?: {label: string, url: string}
  // a second, quieter way forward under the button, e.g. "forgot your password?"
  secondary?: {text: string, label: string, url: string}
  note?: string
  footnote: string
  signoff?: string
}

export type EmailIcon = 'verify' | 'welcome' | 'reset' | 'account-exists' | 'invite' | 'deleted' | 'new-sign-in' | 'email-change' | 'email-change-requested' | 'email-taken'

// colour themes, compared on the dev-only /dev/emails page. midnight was picked on 6 Nov 2026 over ember (cool grey)
// and warm (cream), because its colours are the site's own, so an email looks like the product. to try a new theme, add
// it here and it shows up on that page; the brand ember stays in every theme, because the icons (public/email/*.png) are drawn in it
export type EmailTheme = 'midnight'
export const emailThemes: EmailTheme[] = ['midnight']
export const DEFAULT_EMAIL_THEME: EmailTheme = 'midnight'

type Palette = {page: string, card: string, border: string, strong: string, body: string, muted: string, link: string}

const themes: Record<EmailTheme, {light: Palette, dark: Palette}> = {
  // the site's own "slate and ember": slate headings on a blue-grey page, ember kept for the action
  midnight: {
    light: {page: '#eef1f6', card: '#ffffff', border: '#dde3ec', strong: '#0f172a', body: '#334155', muted: '#64748b', link: '#c2410c'},
    dark: {page: '#070b14', card: '#111827', border: '#1e293b', strong: '#f1f5f9', body: '#cbd5e1', muted: '#94a3b8', link: '#fb923c'},
  },
}

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const tones = {
  brand: {solid: '#c2410c', soft: '#fff7ed', softDark: '#2a1a10'},
  alert: {solid: '#b91c1c', soft: '#fef2f2', softDark: '#2a1215'},
  neutral: {solid: '#334155', soft: '#f1f5f9', softDark: '#1b2230'},
}

// the light colours are inline (every client reads those); the dark ones are classes in a prefers-color-scheme block,
// with !important to beat the inline ones. apple mail, ios mail, outlook and most others follow it. gmail doesn't support
// it at all: the web app shows the light version, and its phone apps recolour light backgrounds and dark text themselves,
// so the light palette avoids anything that inverts badly (pale greys on white, coloured text on tinted backgrounds)
function darkModeCss(tone: EmailContent['tone'], dark: Palette) {
  const rules = `
      .e-page { background-color: ${dark.page} !important; }
      .e-card { background-color: ${dark.card} !important; border-color: ${dark.border} !important; }
      .e-soft { background-color: ${tones[tone].softDark} !important; }
      .e-strong { color: ${dark.strong} !important; }
      .e-body { color: ${dark.body} !important; }
      .e-muted { color: ${dark.muted} !important; }
      .e-divider { background-color: ${dark.border} !important; }
      .e-link { color: ${dark.link} !important; }
      .e-step { background-color: ${dark.border} !important; color: ${dark.strong} !important; }`
  // outlook.com marks its dark mode with these attributes instead of the media query
  const outlook = rules.replace(/\n\s+\./g, '\n      [data-ogsc] .').replace(/\[data-ogsc\] \.e-(page|card|soft|divider|step)/g, '[data-ogsb] .e-$1')
  return `@media (prefers-color-scheme: dark) {${rules}
    }
    ${outlook}`
}

function iconUrl(icon: EmailIcon) {
  return `${getFrontendUrl()}/email/${icon}.png`
}

// the "spotlight" design, picked from three on 2 Nov 2026: a tinted top with a big centred icon and title, then the
// message, with a pill-shaped button
export function renderEmailHtml(mail: EmailContent, theme: EmailTheme = DEFAULT_EMAIL_THEME): string {
  const t = themes[theme].light
  const name = escapeHtml(process.env.APP_NAME || "CKAuth")
  const year = new Date().getFullYear()
  const tone = tones[mail.tone]

  const icon = (size: number) => `<img src="${iconUrl(mail.icon)}" width="${size}" height="${size}" alt="" style="display:block; width:${size}px; height:${size}px; border:0; margin:0 auto;" />`
  const logo = `<img src="${getFrontendUrl()}/email/logo.png" width="28" height="28" alt="" style="display:inline-block; width:28px; height:28px; border:0; vertical-align:middle;" />`

  const title = `<h1 class="e-strong" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:${t.strong}; text-align:center;">${escapeHtml(mail.title)}</h1>`
  const paragraphs = [mail.greeting, ...mail.paragraphs].map(text => `<p class="e-body" style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:${t.body};">${escapeHtml(text)}</p>`).join('\n')

  // numbered circles in the tone colour make a list scannable; a table, because flexbox and ::marker don't survive mail clients
  const steps = mail.steps ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;">
      ${mail.steps.map((step, index) => `<tr>
        <td valign="top" style="padding:0 12px 12px 0;"><div class="e-step" style="width:26px; height:26px; line-height:26px; border-radius:13px; background-color:${tone.soft}; color:${tone.solid}; font-size:13px; font-weight:700; text-align:center;">${index + 1}</div></td>
        <td valign="top" class="e-body" style="padding:2px 0 12px 0; font-size:15px; line-height:22px; color:${t.body};">${escapeHtml(step)}</td>
      </tr>`).join('')}
    </table>` : ''

  // a table cell with bgcolor: the one button shape that renders in outlook, gmail and apple mail alike
  const button = mail.button ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 24px auto;">
      <tr><td bgcolor="${tone.solid}" style="border-radius:999px; background-color:${tone.solid};">
        <a href="${escapeHtml(mail.button.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:14px 28px; font-family:${font}; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:999px;">${escapeHtml(mail.button.label)}</a>
      </td></tr>
    </table>` : ''

  const secondary = mail.secondary ? `<p class="e-body" style="margin:0 0 20px 0; font-size:15px; line-height:22px; color:${t.body}; text-align:center;">${escapeHtml(mail.secondary.text)} <a class="e-link" href="${escapeHtml(mail.secondary.url)}" target="_blank" rel="noopener noreferrer" style="color:${t.link}; font-weight:600; text-decoration:underline;">${escapeHtml(mail.secondary.label)}</a></p>` : ''

  const fallback = mail.button ? `
    ${mail.note ? `<p class="e-muted" style="margin:0 0 16px 0; font-size:14px; line-height:22px; color:${t.muted};">${escapeHtml(mail.note)}</p>` : ''}
    <p class="e-muted" style="margin:0 0 8px 0; font-size:14px; line-height:22px; color:${t.muted};">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 8px 0; font-size:13px; line-height:20px; word-break:break-all;"><a class="e-link" href="${escapeHtml(mail.button.url)}" target="_blank" rel="noopener noreferrer" style="color:${t.link}; text-decoration:underline;">${escapeHtml(mail.button.url)}</a></p>`
    : mail.note ? `<p class="e-muted" style="margin:0 0 8px 0; font-size:14px; line-height:22px; color:${t.muted};">${escapeHtml(mail.note)}</p>` : ''

  const signoff = mail.signoff ? `<p class="e-body" style="margin:8px 0 0 0; font-size:16px; line-height:24px; color:${t.body};">${escapeHtml(mail.signoff).replace(/\n/g, '<br />')}</p>` : ''

  const body = `${paragraphs}${steps}${button}${secondary}${fallback}${signoff}`
  const footnote = `
    <tr><td class="px" style="padding:0 40px;"><div class="e-divider" style="height:1px; line-height:1px; font-size:1px; background-color:${t.border};">&nbsp;</div></td></tr>
    <tr><td class="px e-muted" style="padding:20px 40px 32px 40px; font-family:${font}; font-size:13px; line-height:20px; color:${t.muted};">${escapeHtml(mail.footnote)}</td></tr>`

  const header = `<tr><td align="center" class="e-strong" style="padding-bottom:20px; font-family:${font}; font-size:18px; font-weight:700; color:${t.strong};">${logo}<span style="vertical-align:middle; padding-left:8px;">${name}</span></td></tr>`
  const card = `
    <tr><td class="e-card" style="background-color:${t.card}; border:1px solid ${t.border}; border-radius:16px; overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="e-soft px" align="center" style="background-color:${tone.soft}; padding:36px 40px 20px 40px; font-family:${font}; border-radius:16px 16px 0 0;">
          <div style="margin:0 0 20px 0;">${icon(72)}</div>
          ${title.replace('margin:0 0 16px 0', 'margin:0')}
        </td></tr>
        <tr><td class="px" style="padding:28px 40px 8px 40px; font-family:${font};">
          ${body}
        </td></tr>
        ${footnote}
      </table>
    </td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(mail.title)}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
    }
    ${darkModeCss(mail.tone, themes[theme].dark)}
  </style>
</head>
<body class="e-page" style="margin:0; padding:0; background-color:${t.page};">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${t.page}; opacity:0;">${escapeHtml(mail.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-page" style="background-color:${t.page};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">
          ${header}
          ${card}
          <tr>
            <td align="center" class="e-muted" style="padding:24px 16px 0 16px; font-family:${font}; font-size:12px; line-height:18px; color:${t.muted};">
              This is an automated message, please do not reply.<br />&copy; ${year} ${name}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderEmailText(mail: EmailContent): string {
  const appName = process.env.APP_NAME || "CKAuth"
  return [
    mail.title,
    ``,
    mail.greeting,
    ``,
    ...mail.paragraphs.flatMap(text => [text, ``]),
    ...(mail.steps ? [...mail.steps.map((step, index) => `${index + 1}. ${step}`), ``] : []),
    ...(mail.button ? [`${mail.button.label}:`, mail.button.url, ``] : []),
    ...(mail.secondary ? [`${mail.secondary.text} ${mail.secondary.label}: ${mail.secondary.url}`, ``] : []),
    ...(mail.note ? [mail.note, ``] : []),
    ...(mail.signoff ? [mail.signoff, ``] : []),
    mail.footnote,
    ``,
    `---`,
    `This is an automated message, please do not reply.`,
    `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
  ].join("\n")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
