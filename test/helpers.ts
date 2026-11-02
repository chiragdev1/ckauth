import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after } from 'node:test'
import { createHash } from 'node:crypto'
import bcrypt from 'bcrypt'
import { eq, sql } from 'drizzle-orm'

import { createExpressApplication } from '../src/app/index.js'
import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { outbox } from '../src/utils/mail.js'
import type { UserRole } from '../src/app/auth/utils/constants.js'

// the real app on a free port, one per test file; closed with the db pool once the file's tests have run.
// call it at the top level of a test file, so after() belongs to the file rather than to a hook
export async function startApp() {
  const server = await new Promise<Server>((resolve) => {
    const listening = createExpressApplication().listen(0, () => resolve(listening))
  })

  after(async () => {
    // fetch keeps connections alive for a few seconds, which would hold close() open
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await db.$client.end()
  })

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

// a fresh slate for every test: no users, no mails. every table is named, and no CASCADE on purpose: if the database
// holds tables this schema doesn't know (someone else's test database), postgres refuses instead of emptying them
export async function resetDatabase() {
  await db.execute(sql`truncate table ${usersTable}`)
  outbox.length = 0
}

type ApiResult = {status: number, body: any, setCookies: string[], headers: Headers}

let clientCount = 0

// a tiny browser: remembers the cookies the api sets, and sends them back, like credentials: 'include'.
// each client also has its own ip (sent as X-Forwarded-For, which the app trusts for one proxy hop), so per-ip rate limits
// behave as they would for separate visitors instead of every test sharing 127.0.0.1
export class Client {
  private cookies = new Map<string, string>()
  readonly ip: string

  constructor(private baseUrl: string, ip?: string) {
    clientCount += 1
    this.ip = ip ?? `10.${(clientCount >> 16) & 255}.${(clientCount >> 8) & 255}.${clientCount & 255}`
  }

  cookie(name: string) {
    return this.cookies.get(name)
  }

  // a second "device" holding the same cookies, e.g. to replay an old refresh token later
  clone() {
    const copy = new Client(this.baseUrl, this.ip)
    copy.cookies = new Map(this.cookies)
    return copy
  }

  async request(method: string, path: string, body?: unknown): Promise<ApiResult> {
    const headers: Record<string, string> = {'x-forwarded-for': this.ip}
    // FormData (uploads) sets its own multipart content type, with the boundary; anything else is sent as JSON
    const isForm = body instanceof FormData
    if(this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    }
    if(body !== undefined && !isForm) {
      headers['content-type'] = 'application/json'
    }

    const response = await fetch(`${this.baseUrl}${path}`, {method, headers, body: body === undefined ? null : isForm ? body : JSON.stringify(body)})

    const setCookies = response.headers.getSetCookie()
    for(const line of setCookies) {
      const pair = line.split(';')[0] ?? ''
      const name = pair.slice(0, pair.indexOf('='))
      const value = pair.slice(pair.indexOf('=') + 1)
      // res.clearCookie() sends an empty value that expired in 1970
      if(value === '' || /expires=Thu, 01 Jan 1970/i.test(line)) {
        this.cookies.delete(name)
      } else {
        this.cookies.set(name, value)
      }
    }

    return {status: response.status, body: await response.json().catch(() => null), setCookies, headers: response.headers}
  }

  get(path: string) {
    return this.request('GET', path)
  }

  // for tests that need a cookie the api would never set, e.g. a forged or expired token
  setCookie(name: string, value: string) {
    this.cookies.set(name, value)
  }

  post(path: string, body?: unknown) {
    return this.request('POST', path, body)
  }

  delete(path: string) {
    return this.request('DELETE', path)
  }
}

type NewUser = {email?: string, password?: string, firstName?: string, role?: UserRole, verified?: boolean}

let userCount = 0

// straight into the database, so a test about admins doesn't depend on sign-up and email verification working
export async function createUser({email, password = 'secret123', firstName = 'Test', role = 'user', verified = true}: NewUser = {}) {
  userCount += 1
  const values = {
    firstName,
    email: email ?? `user${userCount}@ckauth.test`,
    // the lowest bcrypt cost keeps the suite fast; compare() reads the cost from the hash, so sign-in works the same
    password: await bcrypt.hash(password, 4),
    emailVerified: verified,
    role,
  }

  const [user] = await db.insert(usersTable).values(values).returning({id: usersTable.id, email: usersTable.email})
  assert.ok(user, 'test user was not created')
  return {...user, password}
}

export async function signIn(baseUrl: string, user: {email: string, password: string}) {
  const client = new Client(baseUrl)
  const response = await client.post('/auth/sign-in', {email: user.email, password: user.password})
  assert.equal(response.status, 200, `sign-in as ${user.email} failed: ${JSON.stringify(response.body)}`)
  return client
}

// the newest mail to this address; fails the test if there is none
export function lastMailTo(email: string) {
  const mail = outbox.findLast((sent) => sent.to === email)
  assert.ok(mail, `no mail was sent to ${email}`)
  return mail
}

// the single-use token from a verify or reset link, exactly as the user would click it
export function tokenFrom(mail: {text: string}) {
  const token = mail.text.match(/token=([0-9a-f]{64})/)?.[1]
  assert.ok(token, 'the mail has no token link')
  return token
}

// the whole stored row, to check what the database really holds (hashes, expiry times)
export async function findUser(email: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email))
  return user
}

// signs up through the api and returns the token from the verification mail
export async function signUp(baseUrl: string, email: string, password = 'secret123') {
  const response = await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email, password})
  assert.equal(response.status, 201)
  return tokenFrom(lastMailTo(email))
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function mailsTo(email: string) {
  return outbox.filter((sent) => sent.to === email)
}
