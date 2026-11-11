import "dotenv/config"
import {Resend} from "resend"
import {renderEmailHtml, renderEmailText} from "./email-layout.js"
import {emails, type Email} from "./emails.js"

const resendClient = new Resend(process.env.RESEND_API_KEY)
// no fallback address: the sender domain is configuration (it must be verified in resend), never baked into the code
if(!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM is not set, e.g. CKAuth <no-reply@yourdomain.com>")
}
const from = process.env.EMAIL_FROM

type OutboxMail = {to: string, subject: string, html: string, text: string}

// the test suite sets MAIL_TRANSPORT=memory, so no mail ever leaves the machine and a test can read the link a user would click.
// the push happens before the first await, so the mail is in the outbox by the time the request that sent it has answered
export const outbox: OutboxMail[] = []

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if(process.env.MAIL_TRANSPORT === 'memory') {
    // a reserved test domain that always fails, so the tests can prove a failed mail never fails the request
    if(to.endsWith('@mail-fails.test')) {
      throw new Error('Simulated mail failure')
    }
    outbox.push({to, subject, html, text})
    return null
  }

  const {data, error} = await resendClient.emails.send({
    to,
    from,
    html,
    subject,
    text,
  })

  // every caller logs the failure with its request id, so resend's reason goes in the error rather than a line of its own
  if (error) {
    throw new Error(`Resend rejected the mail: ${error.message}`)
  }

  return data
}

// renders one of emails.ts in the chosen design (email-layout.ts), with a plain-text part for clients that want it
function sendMail(to: string, {subject, content}: Email) {
  return sendEmail(to, subject, renderEmailHtml(content), renderEmailText(content))
}

export async function sendEmailVerificationMail(to: string, verificationUrl: string) {
  return await sendMail(to, emails.verification(verificationUrl))
}

export async function sendWelcomeMail(to: string, firstName: string) {
  return await sendMail(to, emails.welcome(firstName))
}

export async function sendResetPasswordMail(to: string, firstName: string, resetUrl: string) {
  return await sendMail(to, emails.resetPassword(firstName, resetUrl))
}

// sent when someone signs up with an email that already has a verified account
export async function sendAccountExistsMail(to: string, firstName: string, signinUrl: string, forgotPasswordUrl: string) {
  return await sendMail(to, emails.accountExists(firstName, signinUrl, forgotPasswordUrl))
}

export async function sendInviteMail(to: string, firstName: string, setPasswordUrl: string, expiresInHours: number) {
  return await sendMail(to, emails.invite(firstName, setPasswordUrl, expiresInHours))
}

export async function sendAccountDeletedMail(to: string, firstName: string, contactUrl: string, deletedBy: 'admin' | 'user' = 'admin') {
  return await sendMail(to, emails.accountDeleted(firstName, contactUrl, deletedBy))
}

export async function sendNewSignInMail(to: string, firstName: string, device: string, ipAddress: string | null, devicesUrl: string, resetUrl: string) {
  return await sendMail(to, emails.newSignIn(firstName, device, ipAddress, devicesUrl, resetUrl))
}

export async function sendPasswordChangedMail(to: string, firstName: string, how: 'changed' | 'reset', resetUrl: string) {
  return await sendMail(to, emails.passwordChanged(firstName, how, resetUrl))
}

export async function sendConfirmEmailChangeMail(to: string, firstName: string, confirmUrl: string, expiresInMinutes: number) {
  return await sendMail(to, emails.confirmEmailChange(firstName, confirmUrl, expiresInMinutes))
}

export async function sendEmailChangeRequestedMail(to: string, firstName: string, newEmail: string, resetUrl: string) {
  return await sendMail(to, emails.emailChangeRequested(firstName, newEmail, resetUrl))
}

export async function sendEmailChangedMail(to: string, firstName: string, newEmail: string, contactUrl: string) {
  return await sendMail(to, emails.emailChanged(firstName, newEmail, contactUrl))
}

export async function sendEmailTakenMail(to: string) {
  return await sendMail(to, emails.emailTaken())
}
