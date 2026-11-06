import { test, expect } from './fixtures.ts'

test('sign up, open the emailed link, verify with the password and land on the dashboard', async ({page, email, inbox}) => {
  const password = 'Correct-horse-battery-9'

  await page.goto('/sign-up')
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', {exact: true}).fill(password)
  await page.getByRole('button', {name: 'Create account'}).click()

  await expect(page.getByRole('heading', {name: 'Check your inbox'})).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  // the link the email holds, opened in the same browser, the way a user would click it
  const mail = await inbox.latest(email)
  await page.goto(inbox.linkIn(mail))

  await expect(page.getByRole('heading', {name: 'Verify your email'})).toBeVisible()
  await page.getByLabel('Password', {exact: true}).fill(password)
  await page.getByRole('button', {name: /verify/i}).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByRole('heading', {name: 'Hi, Ada'})).toBeVisible()
  await expect(page).toHaveTitle(/Dashboard/)

  // the session lives in httpOnly cookies, so a reload must keep the user signed in
  await page.reload()
  await expect(page.getByRole('heading', {name: 'Hi, Ada'})).toBeVisible()
})

test('a tagged link is counted once, leaves the address bar and goes with the sign-up', async ({page, email}) => {
  const visits: string[] = []
  page.on('request', request => { if(request.url().endsWith('/api/metrics/visit')) visits.push(request.postData() ?? '') })

  await page.goto('/?ref=x')
  await expect.poll(() => visits).toEqual(['{"ref":"x"}'])
  await expect(page).toHaveURL('/')

  // same tab, tag again: already counted
  await page.goto('/sign-up?ref=x')
  await expect(page).toHaveURL('/sign-up')

  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', {exact: true}).fill('Correct-horse-battery-9')
  const signUp = page.waitForRequest(request => request.url().endsWith('/api/auth/sign-up'))
  await page.getByRole('button', {name: 'Create account'}).click()

  expect((await signUp).postDataJSON().ref).toBe('x')
  expect(visits).toHaveLength(1)
})
