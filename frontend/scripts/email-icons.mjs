// builds the email icons' svg sources (email-icons/*.svg) from lucide, the icon set the app already uses (ISC licence).
// gmail strips svg from emails, so each is rendered to public/email/<name>.png (112 px, shown at 56) and served by the
// web container; re-render the pngs after changing this file (docs: DEVLOG, 2 Nov 2026 "emails")
import { writeFile } from 'node:fs/promises'

// one tone per kind of mail: ember is the brand, red a security warning, slate a plain notice
const tones = { brand: '#c2410c', alert: '#b91c1c', neutral: '#334155' }

const icons = {
  'verify': ['mail-check', 'brand'],
  'welcome': ['party-popper', 'brand'],
  'reset': ['key-round', 'brand'],
  'account-exists': ['user-check', 'neutral'],
  'invite': ['user-plus', 'brand'],
  'deleted': ['trash', 'neutral'],
  'new-sign-in': ['monitor-smartphone', 'alert'],
  'email-change': ['at-sign', 'brand'],
  'email-change-requested': ['shield-alert', 'alert'],
  'email-taken': ['user-check', 'neutral'],
}

const attributes = props => Object.entries(props).filter(([name]) => name !== 'key').map(([name, value]) => `${name}="${value}"`).join(' ')

for(const [name, [lucide, tone]] of Object.entries(icons)) {
  const { __iconData } = await import(new URL(`../node_modules/lucide-react/dist/esm/icons/${lucide}.mjs`, import.meta.url).href)
  const shapes = __iconData.node.map(([tag, props]) => `<${tag} ${attributes(props)}/>`).join('')
  // a solid circle with a white glyph: an image is never recoloured by a dark-mode mail app, so it reads on both
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112">`
    + `<circle cx="56" cy="56" r="56" fill="${tones[tone]}"/>`
    + `<g transform="translate(28 28) scale(2.333)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`
    + `</svg>\n`
  await writeFile(new URL(`../email-icons/${name}.svg`, import.meta.url), svg)
}
console.log(`wrote ${Object.keys(icons).length} icons to email-icons/`)
