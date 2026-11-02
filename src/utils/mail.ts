import "dotenv/config"
import {Resend} from "resend"
import {ApiError} from "./api-error.js"

const resendClient = new Resend(process.env.RESEND_API_KEY)
// no fallback address: the sender domain is configuration (it must be verified in resend), never baked into the code
if(!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM is not set, e.g. CKAuth <no-reply@yourdomain.com>")
}
const from = process.env.EMAIL_FROM

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const {data, error} = await resendClient.emails.send({
    to,
    from,
    html,
    subject,
    text,
  })

  if (error) {
    console.error(`Failed to send email to ${to}:`, error)
    throw ApiError.internal("Failed to send email")
  }

  return data
}

export async function sendEmailVerificationMail(to: string, verificationUrl: string) {

  const htmlContent = generateEmailVerificationHtml(verificationUrl)
  
  const textContent = generateEmailVerificationText(verificationUrl)

  return await sendEmail(to, "Verify your email address", htmlContent, textContent)
}

export async function sendWelcomeMail(to: string, firstName: string) {
  const htmlContent = generateWelcomeHtml(firstName);

  const textContent = generateWelcomeText(firstName);

  return await sendEmail(
    to,
    `Welcome to ${process.env.APP_NAME || "CKAuth"}!`,
    htmlContent,
    textContent,
  );
}

export async function sendResetPasswordMail(
  to: string,
  firstName: string,
  resetUrl: string,
) {
  const htmlContent = generateResetPasswordHtml(firstName, resetUrl);

  const textContent = generateResetPasswordText(firstName, resetUrl);

  return await sendEmail(to, "Reset your password", htmlContent, textContent);
}

// sent when someone signs up with an email that already has a verified account
export async function sendAccountExistsMail(
  to: string,
  firstName: string,
  signinUrl: string,
  forgotPasswordUrl: string,
) {
  const htmlContent = generateAccountExistsHtml(firstName, signinUrl, forgotPasswordUrl);

  const textContent = generateAccountExistsText(firstName, signinUrl, forgotPasswordUrl);

  return await sendEmail(to, "You already have an account", htmlContent, textContent);
}

// sent when an admin invites someone: the link sets their first password, which also confirms the email
export async function sendInviteMail(to: string, firstName: string, setPasswordUrl: string, expiresInHours: number) {
  const appName = process.env.APP_NAME || "CKAuth"
  const mail = {
    title: `You're invited to ${appName}`,
    preheader: `Choose a password to finish setting up your ${appName} account.`,
    greeting: `Hi ${firstName},`,
    paragraphs: [`An administrator created a ${appName} account for you with this email address. Choose a password to start using it.`],
    button: {label: 'Choose a password', url: setPasswordUrl},
    note: `This link expires in ${expiresInHours} hours and can be used once. If it expires, use "Forgot password" on the sign-in page to get a new one.`,
    footnote: `Not expecting this? You can ignore this email: nobody can sign in to the account until a password is chosen from this link.`,
  }
  return await sendEmail(to, mail.title, renderNoticeHtml(mail), renderNoticeText(mail))
}

// sent after an admin deletes an account, so the person isn't left wondering why they can't sign in
export async function sendAccountDeletedMail(to: string, firstName: string, contactUrl: string) {
  const appName = process.env.APP_NAME || "CKAuth"
  const mail = {
    title: `Your ${appName} account was deleted`,
    preheader: `Your ${appName} account and its data have been deleted.`,
    greeting: `Hi ${firstName},`,
    paragraphs: [
      `An administrator deleted your ${appName} account. Your profile, password and sessions have been removed, and you've been signed out everywhere.`,
      `If you think this was a mistake, contact us using the details at ${contactUrl}. You can also create a new account at any time.`,
    ],
    footnote: `You're receiving this because this email address belonged to a ${appName} account.`,
  }
  return await sendEmail(to, mail.title, renderNoticeHtml(mail), renderNoticeText(mail))
}

type NoticeMail = {
  title: string
  preheader: string
  greeting: string
  paragraphs: string[]
  button?: {label: string, url: string}
  note?: string
  footnote: string
}

// one layout for the shorter notices, in the same style as the templates below
function renderNoticeHtml(mail: NoticeMail): string {
  const name = escapeHtml(process.env.APP_NAME || "CKAuth")
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  const year = new Date().getFullYear()
  const paragraphs = mail.paragraphs.map(text => `<p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">${escapeHtml(text)}</p>`).join('\n')
  const button = mail.button ? `
                <tr>
                  <td class="px" align="left" style="padding:0 48px 28px 48px;">
                    <a href="${escapeHtml(mail.button.url)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; padding:14px 28px; font-family:${font}; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">
                      ${escapeHtml(mail.button.label)}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding:0 48px 32px 48px; font-family:${font};">
                    ${mail.note ? `<p style="margin:0 0 16px 0; font-size:14px; line-height:22px; color:#6b7280;">${escapeHtml(mail.note)}</p>` : ''}
                    <p style="margin:0 0 8px 0; font-size:14px; line-height:22px; color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;"><a href="${escapeHtml(mail.button.url)}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5; text-decoration:underline;">${escapeHtml(mail.button.url)}</a></p>
                  </td>
                </tr>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${escapeHtml(mail.title)}</title>
  <style>
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #4f46e5; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f4f5f7; opacity:0;">${escapeHtml(mail.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:24px; font-family:${font}; font-size:20px; font-weight:700; color:#111827;">${name}</td>
          </tr>
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:40px 48px 12px 48px; font-family:${font};">
                    <h1 style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#111827;">${escapeHtml(mail.title)}</h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">${escapeHtml(mail.greeting)}</p>
                    ${paragraphs}
                  </td>
                </tr>${button}
                <tr>
                  <td class="px" style="padding:0 48px;"><div style="height:1px; line-height:1px; font-size:1px; background-color:#e5e7eb;">&nbsp;</div></td>
                </tr>
                <tr>
                  <td class="px" style="padding:24px 48px 40px 48px; font-family:${font};">
                    <p style="margin:0; font-size:13px; line-height:20px; color:#9ca3af;">${escapeHtml(mail.footnote)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0 16px; font-family:${font}; font-size:12px; line-height:18px; color:#9ca3af;">
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

function renderNoticeText(mail: NoticeMail): string {
  const appName = process.env.APP_NAME || "CKAuth"
  return [
    mail.title,
    ``,
    mail.greeting,
    ``,
    ...mail.paragraphs.flatMap(text => [text, ``]),
    ...(mail.button ? [`${mail.button.label}:`, mail.button.url, ``] : []),
    ...(mail.note ? [mail.note, ``] : []),
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

function generateEmailVerificationHtml(
  verificationUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  expiresInMinutes: number = 15,
): string {
  const url = escapeHtml(verificationUrl)
  const name = escapeHtml(appName)
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Verify your email address</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #4f46e5; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 22px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f5f7; opacity:0;">
    Confirm your email address to finish setting up your ${name} account.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">

          <!-- Brand -->
          <tr>
            <td align="center" style="padding-bottom:24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:700; color:#111827; letter-spacing:-0.2px;">
              ${name}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:40px 48px 8px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <h1 class="h1" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#111827;">
                      Verify your email address
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">
                      Hi there,
                    </p>
                    <p style="margin:0 0 28px 0; font-size:16px; line-height:24px; color:#374151;">
                      Thanks for signing up for ${name}. Please confirm that this is your email address by clicking the button below.
                    </p>
                  </td>
                </tr>

                <!-- Button -->
                <tr>
                  <td class="px" align="left" style="padding:0 48px 28px 48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px; v-text-anchor:middle; width:220px;" arcsize="17%" stroke="f" fillcolor="#4f46e5">
                            <w:anchorlock/>
                            <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">Verify email address</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${url}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block; padding:14px 28px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">
                            Verify email address
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:0 48px 32px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0 0 16px 0; font-size:14px; line-height:22px; color:#6b7280;">
                      This link will expire in <strong style="color:#374151;">${expiresInMinutes} minutes</strong>. If it expires, you can request a new one from the sign-in page.
                    </p>
                    <p style="margin:0 0 8px 0; font-size:14px; line-height:22px; color:#6b7280;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
                      <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5; text-decoration:underline;">${url}</a>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td class="px" style="padding:0 48px;">
                    <div style="height:1px; line-height:1px; font-size:1px; background-color:#e5e7eb;">&nbsp;</div>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:24px 48px 40px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0; font-size:13px; line-height:20px; color:#9ca3af;">
                      Didn't create an account with ${name}? You can safely ignore this email &mdash; no account will be activated without verification.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 0 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;">
              This is an automated message, please do not reply.<br />
              &copy; ${year} ${name}. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
function generateEmailVerificationText(
  verificationUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  expiresInMinutes: number = 15,
): string {
  const year = new Date().getFullYear()

  return [
    `Verify your email address`,
    ``,
    `Hi there,`,
    ``,
    `Thanks for signing up for ${appName}. Please confirm that this is your email address by opening the link below:`,
    ``,
    verificationUrl,
    ``,
    `This link will expire in ${expiresInMinutes} minutes. If it expires, you can request a new one from the sign-in page.`,
    ``,
    `Didn't create an account with ${appName}? You can safely ignore this email - no account will be activated without verification.`,
    ``,
    `---`,
    `This is an automated message, please do not reply.`,
    `© ${year} ${appName}. All rights reserved.`,
  ].join("\n")
}

function generateWelcomeHtml(
  firstName: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  appUrl: string = process.env.FRONTEND_URL || "http://localhost:3000",
): string {
  const userName = escapeHtml(firstName)
  const name = escapeHtml(appName)
  const url = escapeHtml(appUrl)
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Welcome to ${name}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #4f46e5; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 22px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f5f7; opacity:0;">
    Your ${name} account is ready. Here's how to get started.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">

          <!-- Brand -->
          <tr>
            <td align="center" style="padding-bottom:24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:700; color:#111827; letter-spacing:-0.2px;">
              ${name}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Accent bar -->
                <tr>
                  <td style="height:4px; line-height:4px; font-size:4px; background-color:#4f46e5; border-radius:12px 12px 0 0;">&nbsp;</td>
                </tr>

                <tr>
                  <td class="px" style="padding:40px 48px 8px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <h1 class="h1" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#111827;">
                      Welcome aboard, ${userName}!
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">
                      Your email has been verified and your ${name} account is all set. We're glad to have you with us.
                    </p>
                    <p style="margin:0 0 24px 0; font-size:16px; line-height:24px; color:#374151;">
                      Here are a few things you can do to get started:
                    </p>
                  </td>
                </tr>

                <!-- Steps -->
                <tr>
                  <td class="px" style="padding:0 48px 28px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="36" valign="top" style="padding:0 0 16px 0;">
                          <div style="width:24px; height:24px; line-height:24px; border-radius:12px; background-color:#eef2ff; color:#4f46e5; font-size:13px; font-weight:700; text-align:center;">1</div>
                        </td>
                        <td valign="top" style="padding:0 0 16px 0; font-size:15px; line-height:24px; color:#374151;">
                          <strong style="color:#111827;">Complete your profile</strong> &mdash; add a few details so we can tailor your experience.
                        </td>
                      </tr>
                      <tr>
                        <td width="36" valign="top" style="padding:0 0 16px 0;">
                          <div style="width:24px; height:24px; line-height:24px; border-radius:12px; background-color:#eef2ff; color:#4f46e5; font-size:13px; font-weight:700; text-align:center;">2</div>
                        </td>
                        <td valign="top" style="padding:0 0 16px 0; font-size:15px; line-height:24px; color:#374151;">
                          <strong style="color:#111827;">Explore the platform</strong> &mdash; take a look around and discover what ${name} has to offer.
                        </td>
                      </tr>
                      <tr>
                        <td width="36" valign="top">
                          <div style="width:24px; height:24px; line-height:24px; border-radius:12px; background-color:#eef2ff; color:#4f46e5; font-size:13px; font-weight:700; text-align:center;">3</div>
                        </td>
                        <td valign="top" style="font-size:15px; line-height:24px; color:#374151;">
                          <strong style="color:#111827;">Keep your account secure</strong> &mdash; use a strong, unique password and never share it with anyone.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Button -->
                <tr>
                  <td class="px" align="left" style="padding:0 48px 32px 48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px; v-text-anchor:middle; width:200px;" arcsize="17%" stroke="f" fillcolor="#4f46e5">
                            <w:anchorlock/>
                            <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">Get started</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${url}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block; padding:14px 28px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">
                            Get started
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td class="px" style="padding:0 48px;">
                    <div style="height:1px; line-height:1px; font-size:1px; background-color:#e5e7eb;">&nbsp;</div>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:24px 48px 40px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0 0 12px 0; font-size:14px; line-height:22px; color:#6b7280;">
                      Have questions or need a hand? We're here to help whenever you need us.
                    </p>
                    <p style="margin:0; font-size:14px; line-height:22px; color:#374151;">
                      Cheers,<br />
                      <strong>The ${name} Team</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 0 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;">
              You're receiving this email because you created an account with ${name}.<br />
              This is an automated message, please do not reply.<br />
              &copy; ${year} ${name}. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function generateWelcomeText(
  firstName: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  appUrl: string = process.env.FRONTEND_URL || "http://localhost:3000",
): string {
  const year = new Date().getFullYear()

  return [
    `Welcome aboard, ${firstName}!`,
    ``,
    `Your email has been verified and your ${appName} account is all set. We're glad to have you with us.`,
    ``,
    `Here are a few things you can do to get started:`,
    ``,
    `1. Complete your profile - add a few details so we can tailor your experience.`,
    `2. Explore the platform - take a look around and discover what ${appName} has to offer.`,
    `3. Keep your account secure - use a strong, unique password and never share it with anyone.`,
    ``,
    `Get started: ${appUrl}`,
    ``,
    `Have questions or need a hand? We're here to help whenever you need us.`,
    ``,
    `Cheers,`,
    `The ${appName} Team`,
    ``,
    `---`,
    `You're receiving this email because you created an account with ${appName}.`,
    `This is an automated message, please do not reply.`,
    `© ${year} ${appName}. All rights reserved.`,
  ].join("\n")
}



function generateResetPasswordHtml(
  firstName: string,
  resetUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  expiresInMinutes: number = 15,
): string {
  const userName = escapeHtml(firstName)
  const url = escapeHtml(resetUrl)
  const name = escapeHtml(appName)
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Reset your password</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #4f46e5; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 22px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f5f7; opacity:0;">
    Use this link to reset your ${name} password. It expires in ${expiresInMinutes} minutes.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">

          <!-- Brand -->
          <tr>
            <td align="center" style="padding-bottom:24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:700; color:#111827; letter-spacing:-0.2px;">
              ${name}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:40px 48px 8px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <h1 class="h1" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#111827;">
                      Reset your password
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">
                      Hi ${userName},
                    </p>
                    <p style="margin:0 0 28px 0; font-size:16px; line-height:24px; color:#374151;">
                      We received a request to reset the password for your ${name} account. Click the button below to choose a new password.
                    </p>
                  </td>
                </tr>

                <!-- Button -->
                <tr>
                  <td class="px" align="left" style="padding:0 48px 28px 48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px; v-text-anchor:middle; width:200px;" arcsize="17%" stroke="f" fillcolor="#4f46e5">
                            <w:anchorlock/>
                            <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">Reset password</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${url}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block; padding:14px 28px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">
                            Reset password
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:0 48px 32px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0 0 16px 0; font-size:14px; line-height:22px; color:#6b7280;">
                      This link will expire in <strong style="color:#374151;">${expiresInMinutes} minutes</strong> and can only be used once. If it expires, you can request a new one from the sign-in page.
                    </p>
                    <p style="margin:0 0 8px 0; font-size:14px; line-height:22px; color:#6b7280;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
                      <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5; text-decoration:underline;">${url}</a>
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td class="px" style="padding:0 48px;">
                    <div style="height:1px; line-height:1px; font-size:1px; background-color:#e5e7eb;">&nbsp;</div>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:24px 48px 40px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0; font-size:13px; line-height:20px; color:#9ca3af;">
                      Didn't request a password reset? You can safely ignore this email &mdash; your password won't change unless you open the link above and set a new one.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 0 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;">
              For your security, never share this link with anyone. ${name} will never ask for your password.<br />
              This is an automated message, please do not reply.<br />
              &copy; ${year} ${name}. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function generateResetPasswordText(
  firstName: string,
  resetUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
  expiresInMinutes: number = 15,
): string {
  const year = new Date().getFullYear()

  return [
    `Reset your password`,
    ``,
    `Hi ${firstName},`,
    ``,
    `We received a request to reset the password for your ${appName} account. Open the link below to choose a new password:`,
    ``,
    resetUrl,
    ``,
    `This link will expire in ${expiresInMinutes} minutes and can only be used once. If it expires, you can request a new one from the sign-in page.`,
    ``,
    `Didn't request a password reset? You can safely ignore this email - your password won't change unless you open the link above and set a new one.`,
    ``,
    `---`,
    `For your security, never share this link with anyone. ${appName} will never ask for your password.`,
    `This is an automated message, please do not reply.`,
    `© ${year} ${appName}. All rights reserved.`,
  ].join("\n")
}

function generateAccountExistsHtml(
  firstName: string,
  signinUrl: string,
  forgotPasswordUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
): string {
  const userName = escapeHtml(firstName)
  const signin = escapeHtml(signinUrl)
  const forgotPassword = escapeHtml(forgotPasswordUrl)
  const name = escapeHtml(appName)
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>You already have an account</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #4f46e5; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .h1 { font-size: 22px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f4f5f7; opacity:0;">
    Someone tried to create a ${name} account with this email address.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">

          <!-- Brand -->
          <tr>
            <td align="center" style="padding-bottom:24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:700; color:#111827; letter-spacing:-0.2px;">
              ${name}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:40px 48px 8px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <h1 class="h1" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#111827;">
                      You already have an account
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#374151;">
                      Hi ${userName},
                    </p>
                    <p style="margin:0 0 28px 0; font-size:16px; line-height:24px; color:#374151;">
                      Someone just tried to sign up for ${name} with this email address, but an account already exists for it. If that was you, you can sign in below.
                    </p>
                  </td>
                </tr>

                <!-- Button -->
                <tr>
                  <td class="px" align="left" style="padding:0 48px 28px 48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#4f46e5" style="border-radius:8px;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${signin}" style="height:48px; v-text-anchor:middle; width:200px;" arcsize="17%" stroke="f" fillcolor="#4f46e5">
                            <w:anchorlock/>
                            <center style="color:#ffffff; font-family:Arial, sans-serif; font-size:16px; font-weight:bold;">Sign in</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${signin}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block; padding:14px 28px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; line-height:20px; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">
                            Sign in
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:0 48px 32px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0; font-size:14px; line-height:22px; color:#6b7280;">
                      Forgot your password? <a href="${forgotPassword}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5; text-decoration:underline;">Reset it here</a>.
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td class="px" style="padding:0 48px;">
                    <div style="height:1px; line-height:1px; font-size:1px; background-color:#e5e7eb;">&nbsp;</div>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:24px 48px 40px 48px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <p style="margin:0; font-size:13px; line-height:20px; color:#9ca3af;">
                      Wasn't you? You can safely ignore this email &mdash; no changes were made to your account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 0 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;">
              This is an automated message, please do not reply.<br />
              &copy; ${year} ${name}. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function generateAccountExistsText(
  firstName: string,
  signinUrl: string,
  forgotPasswordUrl: string,
  appName: string = process.env.APP_NAME || "CKAuth",
): string {
  const year = new Date().getFullYear()

  return [
    `You already have an account`,
    ``,
    `Hi ${firstName},`,
    ``,
    `Someone just tried to sign up for ${appName} with this email address, but an account already exists for it. If that was you, you can sign in here:`,
    ``,
    signinUrl,
    ``,
    `Forgot your password? Reset it here: ${forgotPasswordUrl}`,
    ``,
    `Wasn't you? You can safely ignore this email - no changes were made to your account.`,
    ``,
    `---`,
    `This is an automated message, please do not reply.`,
    `© ${year} ${appName}. All rights reserved.`,
  ].join("\n")
}
