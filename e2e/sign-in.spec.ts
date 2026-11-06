import { test, expect } from './fixtures.ts'

test('sign in with the right password and land on the dashboard', async ({page, verifiedUser}) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(verifiedUser.email)
  await page.getByLabel('Password', {exact: true}).fill(verifiedUser.password)
  // the header has a "Sign in" link too; the form's button is the one inside <main>
  await page.getByRole('main').getByRole('button', {name: 'Sign in'}).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByRole('heading', {name: `Hi, ${verifiedUser.firstName}`})).toBeVisible()
})

// CLAUDE.md's "no account enumeration" rule, seen from the browser: a wrong password and an email nobody signed up
// with must look exactly alike, or the sign-in page tells an attacker which emails are registered
test('a wrong password and an unknown email get the same answer', async ({page, verifiedUser}) => {
  // what an attacker can see: the api's status and body, and what the page then shows
  const tryToSignIn = async (email: string, password: string) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', {exact: true}).fill(password)
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in')),
      page.getByRole('main').getByRole('button', {name: 'Sign in'}).click(),
    ])
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(page).toHaveURL('/sign-in')
    return {status: response.status(), body: await response.json(), shown: await alert.innerText()}
  }

  const wrongPassword = await tryToSignIn(verifiedUser.email, 'Not-the-right-password-1')
  const unknownEmail = await tryToSignIn(`nobody-${verifiedUser.email}`, verifiedUser.password)

  expect(wrongPassword.status).toBe(401)
  expect(unknownEmail).toEqual(wrongPassword)
})
