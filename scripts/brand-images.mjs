// renders the brand svgs to png in chromium, so css variables, filters and the Inter font all work. `pnpm brand:images`
// each png carries the sha-256 of its source in a tEXt chunk; frontend/scripts/check-dist.js fails the build when a
// source changed but its png wasn't re-rendered
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {crc32} from 'node:zlib'
import {dirname} from 'node:path'
import {chromium} from '@playwright/test'

const root = new URL('../', import.meta.url)
const font = await readFile(new URL('frontend/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', root))

const og = 'frontend/og-image.svg', icon = 'frontend/brand/icon.svg', header = 'frontend/brand/social-header.svg'
const outputs = [
  // link previews: dark only, a preview can't follow the reader's theme
  {source: og, file: 'frontend/public/og.png', width: 1200, height: 630, theme: 'dark'},
  // the README banner (a <picture> that follows GitHub's theme) and GitHub's social preview
  {source: og, file: 'docs/brand/ckauth-dark.png', width: 1280, height: 640, theme: 'dark'},
  {source: og, file: 'docs/brand/ckauth-light.png', width: 1280, height: 640, theme: 'light'},
  // home-screen icons: ios (apple-touch-icon) and android/chrome (public/manifest.json)
  {source: icon, file: 'frontend/public/apple-touch-icon.png', width: 180, height: 180, theme: 'dark'},
  {source: icon, file: 'frontend/public/icon-192.png', width: 192, height: 192, theme: 'dark'},
  {source: icon, file: 'frontend/public/icon-512.png', width: 512, height: 512, theme: 'dark'},
  // the social profile kit
  ...['dark', 'light'].flatMap(theme => [
    {source: icon, file: `docs/brand/social/avatar-${theme}.png`, width: 400, height: 400, theme},
    {source: header, file: `docs/brand/social/x-header-${theme}.png`, width: 1500, height: 500, theme},
    {source: header, file: `docs/brand/social/linkedin-banner-${theme}.png`, width: 1584, height: 396, theme},
  ]),
]

const sourceHash = svg => createHash('sha256').update(svg).digest('hex')

// a png is chunks after an 8-byte signature; a tEXt chunk (keyword, NUL, text) before the last one (IEND) is plain metadata
function withSourceHash(png, hash) {
  const data = Buffer.from(`ckauth-source\0${hash}`, 'latin1')
  const type = Buffer.from('tEXt', 'latin1')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  type.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length)
  const iend = png.length - 12
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)])
}

const browser = await chromium.launch()
try {
  for(const {source, file, width, height, theme} of outputs) {
    const svg = await readFile(new URL(source, root), 'utf8')
    const page = await browser.newPage({viewport: {width, height}})
    // "slice" fills other sizes by cropping the design a little, never by stretching it
    const sized = svg.replace('<svg ', `<svg class="${theme}" preserveAspectRatio="xMidYMid slice" style="width:100vw;height:100vh;display:block" `)
    await page.setContent(`<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-weight:100 900}
      html,body{margin:0}</style>${sized}`)
    await page.evaluate(() => document.fonts.ready)
    const png = withSourceHash(await page.screenshot(), sourceHash(svg))
    await page.close()
    const path = new URL(file, root).pathname
    await mkdir(dirname(path), {recursive: true})
    await writeFile(path, png)
    console.log(`${file} (${width}×${height}, ${theme})`)
  }
} finally {
  await browser.close()
}
