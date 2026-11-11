import type { EmailContent } from "./email-layout.js"

// what every email says, kept apart from how it looks (email-layout.ts) and how it's sent (mail.ts), so the dev-only
// preview (src/app/dev) can render each one with sample values without sending anything
export type Email = {subject: string, content: EmailContent}

const appName = () => process.env.APP_NAME || "CKAuth"
const appUrl = () => process.env.FRONTEND_URL || "http://localhost:3000"

export const emails = {
  verification(verificationUrl: string, expiresInMinutes = 15): Email {
    return {subject: 'Verify your email address', content: {
      icon: 'verify', tone: 'brand',
      title: 'Verify your email address',
      preheader: `Confirm your email address to finish setting up your ${appName()} account.`,
      greeting: 'Hi there,',
      paragraphs: [`Thanks for signing up for ${appName()}. Please confirm that this is your email address by clicking the button below.`],
      button: {label: 'Verify email address', url: verificationUrl},
      note: `This link will expire in ${expiresInMinutes} minutes. If it expires, you can request a new one from the sign-in page.`,
      footnote: `Didn't create an account with ${appName()}? You can safely ignore this email - no account will be activated without verification.`,
    }}
  },

  welcome(firstName: string): Email {
    return {subject: `Welcome to ${appName()}!`, content: {
      icon: 'welcome', tone: 'brand',
      title: `Welcome aboard, ${firstName}!`,
      preheader: `Your ${appName()} account is ready.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [`Your email has been verified and your ${appName()} account is all set. We're glad to have you with us. Here are a few things you can do to get started:`],
      steps: [
        'Complete your profile - add a photo and check your details.',
        `Explore the platform - take a look around and discover what ${appName()} has to offer.`,
        'Keep your account secure - use a strong, unique password and never share it with anyone.',
      ],
      button: {label: 'Go to your dashboard', url: `${appUrl()}/dashboard`},
      signoff: `Cheers,\nThe ${appName()} Team`,
      footnote: `You're receiving this email because you created an account with ${appName()}.`,
    }}
  },

  resetPassword(firstName: string, resetUrl: string, expiresInMinutes = 15): Email {
    return {subject: 'Reset your password', content: {
      icon: 'reset', tone: 'brand',
      title: 'Reset your password',
      preheader: `Choose a new password for your ${appName()} account.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [`We received a request to reset the password for your ${appName()} account. Click the button below to choose a new password.`],
      button: {label: 'Reset password', url: resetUrl},
      note: `This link will expire in ${expiresInMinutes} minutes and can only be used once. If it expires, you can request a new one from the sign-in page.`,
      footnote: `Didn't request a password reset? You can safely ignore this email - your password won't change unless you open the link above and set a new one. ${appName()} will never ask for your password.`,
    }}
  },

  accountExists(firstName: string, signinUrl: string, forgotPasswordUrl: string): Email {
    return {subject: 'You already have an account', content: {
      icon: 'account-exists', tone: 'neutral',
      title: 'You already have an account',
      preheader: `Someone tried to sign up for ${appName()} with this email.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [`Someone just tried to sign up for ${appName()} with this email address, but an account already exists for it. If that was you, you can sign in instead.`],
      button: {label: 'Sign in', url: signinUrl},
      secondary: {text: 'Forgot your password?', label: 'Reset it here', url: forgotPasswordUrl},
      footnote: `Wasn't you? You can safely ignore this email - no changes were made to your account.`,
    }}
  },

  // sent when an admin invites someone: the link sets their first password, which also confirms the email
  invite(firstName: string, setPasswordUrl: string, expiresInHours: number): Email {
    return {subject: `You're invited to ${appName()}`, content: {
      icon: 'invite', tone: 'brand',
      title: `You're invited to ${appName()}`,
      preheader: `Choose a password to finish setting up your ${appName()} account.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [`An administrator created a ${appName()} account for you with this email address. Choose a password to start using it.`],
      button: {label: 'Choose a password', url: setPasswordUrl},
      note: `This link expires in ${expiresInHours} hours and can be used once. If it expires, use "Forgot password" on the sign-in page to get a new one.`,
      footnote: `Not expecting this? You can ignore this email: nobody can sign in to the account until a password is chosen from this link.`,
    }}
  },

  // sent after an account is deleted, by an admin or by its owner, so a deletion nobody expected doesn't go unnoticed
  accountDeleted(firstName: string, contactUrl: string, deletedBy: 'admin' | 'user'): Email {
    return {subject: `Your ${appName()} account was deleted`, content: {
      icon: 'deleted', tone: 'neutral',
      title: `Your ${appName()} account was deleted`,
      preheader: `Your ${appName()} account and its data have been deleted.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [
        deletedBy === 'admin'
          ? `An administrator deleted your ${appName()} account. Your profile, password and sessions have been removed, and you've been signed out everywhere.`
          : `Your ${appName()} account was deleted from your account page, as you asked. Your profile, password, photo and sessions have been removed.`,
        deletedBy === 'admin'
          ? `If you think this was a mistake, contact us using the details at ${contactUrl}. You can also create a new account at any time.`
          : `If you didn't do this, someone knew your password: contact us using the details at ${contactUrl}. You can create a new account at any time.`,
      ],
      footnote: `You're receiving this because this email address belonged to a ${appName()} account.`,
    }}
  },

  // sent when an account is signed in on a browser it has no other session on, so a stranger with the password is noticed
  newSignIn(firstName: string, device: string, ipAddress: string | null, devicesUrl: string, resetUrl: string, when = new Date()): Email {
    return {subject: `New sign-in to your ${appName()} account`, content: {
      icon: 'new-sign-in', tone: 'alert',
      title: `New sign-in to your ${appName()} account`,
      preheader: `Your account was just signed in on ${device}.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [
        `Your ${appName()} account was just signed in on ${device}${ipAddress ? ` from the IP address ${ipAddress}` : ''} (${when.toUTCString()}).`,
        `If this was you, there's nothing to do. If it wasn't, sign that device out from your dashboard and change your password straight away.`,
      ],
      button: {label: 'Review your devices', url: devicesUrl},
      secondary: {text: `Can't sign in any more?`, label: 'Reset your password', url: resetUrl},
      footnote: `We send this when your account is signed in on a browser it isn't already signed in on.`,
    }}
  },

  // after a password change or reset, so a change the owner didn't make doesn't go unnoticed: whoever made it already
  // knew the old password or had the inbox, and the owner's other devices were just signed out without a word
  passwordChanged(firstName: string, how: 'changed' | 'reset', resetUrl: string, when = new Date()): Email {
    return {subject: `Your ${appName()} password was ${how}`, content: {
      icon: 'reset', tone: 'alert',
      title: `Your ${appName()} password was ${how}`,
      preheader: `Your ${appName()} password was just ${how}, and other devices were signed out.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [
        how === 'changed'
          ? `Your ${appName()} password was changed from a signed-in device (${when.toUTCString()}). Every other device was signed out.`
          : `Your ${appName()} password was reset with a link sent to this address (${when.toUTCString()}). Every device was signed out.`,
        `If this was you, there's nothing to do. If it wasn't, reset your password now: the link goes to this inbox, so it works even if someone else knows your password.`,
      ],
      button: {label: 'Reset your password', url: resetUrl},
      footnote: `We send this every time your password changes. It never contains your password.`,
    }}
  },

  // to the new address: opening the link proves the inbox, and only then does the account's email change
  confirmEmailChange(firstName: string, confirmUrl: string, expiresInMinutes: number): Email {
    return {subject: `Confirm your new ${appName()} email`, content: {
      icon: 'email-change', tone: 'brand',
      title: `Confirm your new ${appName()} email`,
      preheader: `Confirm this address to finish changing your ${appName()} email.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [`You asked to use this address for your ${appName()} account. Confirm it, and it becomes the address you sign in with.`],
      button: {label: 'Confirm this email', url: confirmUrl},
      note: `This link expires in ${expiresInMinutes} minutes and can be used once.`,
      footnote: `Didn't ask for this? You can ignore this email: nothing changes unless the link is opened.`,
    }}
  },

  // to the current address, the moment a change is requested, so the owner hears about it before it can take effect
  emailChangeRequested(firstName: string, newEmail: string, resetUrl: string): Email {
    return {subject: 'A change of email was requested', content: {
      icon: 'email-change-requested', tone: 'alert',
      title: 'A change of email was requested',
      preheader: `Someone asked to move your ${appName()} account to another email address.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [
        `Someone signed in to your ${appName()} account and asked to change its email to ${newEmail}. It changes only if that address confirms it.`,
        `If this wasn't you, someone knows your password: reset it now, which signs every device out.`,
      ],
      button: {label: 'Reset your password', url: resetUrl},
      footnote: `You're receiving this because this is the email on your ${appName()} account.`,
    }}
  },

  // to the old address once the change is done, so a change nobody expected doesn't go unnoticed
  emailChanged(firstName: string, newEmail: string, contactUrl: string): Email {
    return {subject: `Your ${appName()} email was changed`, content: {
      icon: 'email-change', tone: 'neutral',
      title: `Your ${appName()} email was changed`,
      preheader: `Your ${appName()} account now uses a different email address.`,
      greeting: `Hi ${firstName},`,
      paragraphs: [
        `Your ${appName()} account's email is now ${newEmail}. You'll sign in with that address from now on, and this one will no longer get account emails.`,
        `If you didn't do this, contact us straight away using the details at ${contactUrl}.`,
      ],
      footnote: 'This is the last account email sent to this address.',
    }}
  },

  // to an address that already has an account, instead of a link: same response to the requester, so nothing is revealed
  emailTaken(): Email {
    return {subject: `This email already has a ${appName()} account`, content: {
      icon: 'email-taken', tone: 'neutral',
      title: `This email already has a ${appName()} account`,
      preheader: 'Someone tried to move another account to this address.',
      greeting: 'Hi,',
      paragraphs: [`Someone asked to change their ${appName()} account's email to this address. It already belongs to an account, so nothing was changed.`],
      footnote: `No action is needed. If you didn't expect this, you can ignore it.`,
    }}
  },
}
