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
