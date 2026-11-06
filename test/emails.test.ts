import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { describe, test } from 'node:test'

import { createExpressApplication } from '../src/app/index.js'
import { emailThemes, renderEmailHtml, renderEmailText } from '../src/utils/email-layout.js'
import { emails } from '../src/utils/emails.js'
import { Client, startApp } from './helpers.js'

const baseUrl = await startApp()

describe('email layout', () => {
  const welcome = emails.welcome('<b>Ada</b>').content

  test('every theme renders the content, its icon and a dark mode', () => {
    for(const theme of emailThemes) {
      const html = renderEmailHtml(welcome, theme)
      assert.match(html, /Welcome aboard/, theme)
      assert.match(html, /\/email\/welcome\.png/, theme)
      assert.match(html, /@media \(prefers-color-scheme: dark\)/, theme)
      assert.match(html, /\[data-ogsc\]/, `${theme}: outlook.com's dark mode`)
      assert.match(html, /<meta name="color-scheme" content="light dark"/, theme)
    }
  })

  test('every theme colours both the light version and the dark one', () => {
    for(const theme of emailThemes) {
      const html = renderEmailHtml(welcome, theme)
      const page = html.match(/<body class="e-page" style="[^"]*background-color:(#[0-9a-f]{6})/)?.[1]
      const darkPage = html.match(/\.e-page \{ background-color: (#[0-9a-f]{6})/)?.[1]
      assert.ok(page && darkPage && page !== darkPage, `${theme}: light page ${page}, dark page ${darkPage}`)
    }
  })

  test('the emails use the site\'s own colours (midnight, picked 6 Nov 2026)', () => {
    const html = renderEmailHtml(welcome)
    // frontend/src/index.css: --foreground #0f172a by day, --card #111827 by night
    assert.match(html, /color:#0f172a/, 'headings are the site\'s slate')
    assert.match(html, /\.e-card \{ background-color: #111827/, 'the dark card is the dashboard\'s card')
  })

  test('values from users are escaped, never inserted as html', () => {
    for(const theme of emailThemes) {
      const html = renderEmailHtml(welcome, theme)
      assert.ok(!html.includes('<b>Ada</b>'), theme)
      assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/, theme)
    }
  })

  test('the text part carries the words, steps and links of the html', () => {
    const text = renderEmailText(welcome)
    assert.match(text, /1\. Complete your profile/)
    assert.match(text, /Go to your dashboard:\nhttp/)
    const exists = renderEmailText(emails.accountExists('Ada', 'https://x.test/sign-in', 'https://x.test/forgot').content)
    assert.match(exists, /Forgot your password\? Reset it here: https:\/\/x\.test\/forgot/)
  })
})

describe('GET /dev/emails (development only)', () => {
  test('lists every email and theme, and renders each one as html', async () => {
    const client = new Client(baseUrl)
    const list = await client.get('/dev/emails')
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.data.themes, emailThemes)
    assert.equal(list.body.data.emails.length, 11)

    for(const theme of emailThemes) {
      const response = await fetch(`${baseUrl}/dev/emails/new-sign-in?theme=${theme}`)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /text\/html/)
      assert.match(await response.text(), /Chrome on Windows/)
    }
  })

  test('an unknown email or theme is a 404', async () => {
    assert.equal((await fetch(`${baseUrl}/dev/emails/nope`)).status, 404)
    assert.equal((await fetch(`${baseUrl}/dev/emails/welcome?theme=nope`)).status, 404)
  })

  test('does not exist in production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const server = createExpressApplication().listen(0)
    process.env.NODE_ENV = previous
    try {
      await new Promise(resolve => server.once('listening', resolve))
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/dev/emails`)
      assert.equal(response.status, 404)
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  })
})
