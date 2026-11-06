import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'

type Mail = {to: string, subject: string, text: string}

type User = {email: string, password: string, firstName: string}

type Fixtures = {
  // an address no other test (or earlier run) has used, so tests never share an account
  email: string
  // a signed-up and verified account, made through the API (no clicking) for tests whose journey starts after sign-up.
  // the browser isn't signed in: the API calls use their own cookie jar
  verifiedUser: User
  inbox: {
    // the newest mail to an address, waiting briefly for it to arrive
    latest: (to: string) => Promise<Mail>
    // the first CKAuth link in that mail (the verify, reset or confirm link a user would click)
    linkIn: (mail: Mail) => string
  }
}

// every browser here shares 127.0.0.1, and the API counts rate limits per IP (10 sign-ups an hour), so a full run
// would trip them. trust proxy is on (src/app/index.ts), so like test/helpers.ts's Client each test sends its own
// X-Forwarded-For: a separate visitor as far as the limits can tell. 198.18.0.0/15 is reserved for benchmarking;
// the third byte is the worker slot, so two workers never hand out the same address
let testsInWorker = 0

export const test = base.extend<Fixtures>({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    testsInWorker++
    await use({'X-Forwarded-For': `198.18.${testInfo.parallelIndex}.${testsInWorker % 254 + 1}`})
  },

  email: async ({}, use) => {
    await use(`e2e-${randomUUID()}@example.test`)
  },

  inbox: async ({request}, use) => {
    await use({
      latest: to => latestMail(request, to),
      linkIn: mail => {
        const link = mail.text.match(/https?:\/\/\S+token=[0-9a-f]{64}\S*/)?.[0]
        expect(link, `no token link in "${mail.subject}"`).toBeTruthy()
        return link!
      },
    })
  },

  verifiedUser: async ({request, email, inbox}, use) => {
    const user = {email, password: 'Correct-horse-battery-9', firstName: 'Grace'}
    expect((await request.post('/api/auth/sign-up', {data: {...user, lastName: null}})).ok()).toBe(true)
    const token = new URL(inbox.linkIn(await inbox.latest(email))).searchParams.get('token')
    expect((await request.post(`/api/auth/verify-email/${token}`, {data: {password: user.password}})).ok()).toBe(true)
    await use(user)
  },
})

async function latestMail(request: APIRequestContext, to: string) {
  let mail: Mail | undefined
  // the API pushes a mail before it answers, but polling keeps tests honest if a send ever moves after the response
  await expect.poll(async () => {
    const response = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`)
    if(response.ok()) {
      mail = (await response.json()).data
    }
    return response.status()
  }, {message: `no mail to ${to}`, timeout: 5_000}).toBe(200)
  return mail!
}

export { expect }
