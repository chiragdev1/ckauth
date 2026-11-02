import { ApiRequestError } from './api.ts'

export type FieldErrors = Partial<Record<string, string>>

// mirrors src/app/auth/models.ts so mistakes show instantly; the api still validates everything
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateFirstName(value: string) {
  const name = value.trim()
  if(!name) return 'Enter your first name'
  if(name.length < 2) return 'First name needs at least 2 characters'
  if(name.length > 45) return 'First name can be at most 45 characters'
}

export function validateLastName(value: string) {
  if(value.trim().length > 45) return 'Last name can be at most 45 characters'
}

export function validateEmail(value: string) {
  const email = value.trim()
  if(!email) return 'Enter your email address'
  if(email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com'
}

// for passwords that already exist (sign in, verify, current password): older accounts may predate today's rules
export function validateExistingPassword(value: string) {
  if(!value) return 'Enter your password'
}

// new passwords are held to a higher bar than the api's 6 to 72, so fresh accounts start strong
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export function passwordRequirements(password: string) {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, met: password.length >= PASSWORD_MIN },
    { label: 'A letter', met: /[a-z]/i.test(password) },
    { label: 'A number', met: /\d/.test(password) },
  ]
}

export function validateNewPassword(value: string) {
  if(!value) return 'Choose a password'
  if(value.length > PASSWORD_MAX) return `Password can be at most ${PASSWORD_MAX} characters`
  if(passwordRequirements(value).some(rule => !rule.met)) return 'Password doesn\'t meet the requirements below'
}

export function validateConfirmation(value: string, password: string) {
  if(!value) return 'Type the password again'
  if(value !== password) return 'Passwords don\'t match'
}

// used when the api rejects a field the client let through; the raw zod text is not shown to people
const fieldFallbacks: Record<string, string> = {
  firstName: 'Check your first name',
  lastName: 'Check your last name',
  email: 'Enter a valid email address',
  password: 'Check your password',
  newPassword: 'Choose a different password',
  currentPassword: 'Check your current password',
  newEmail: 'Enter a valid email address',
}

// "Invalid input fields: email: Invalid email address, password: Too small: …" → { email, password }
function parseInvalidFields(message: string): FieldErrors | null {
  const prefix = 'Invalid input fields: '
  if(!message.startsWith(prefix)) return null
  const fieldErrors: FieldErrors = {}
  // split only before "name: ", since zod messages can contain commas themselves
  for(const part of message.slice(prefix.length).split(/,\s(?=[\w.]+:\s)/)) {
    const field = part.slice(0, part.indexOf(':')).split('.')[0] ?? ''
    // the refine on change-password carries a message written for people, so keep it
    const detail = part.slice(part.indexOf(':') + 1).trim()
    fieldErrors[field] = detail.startsWith('New password must be different') ? detail : fieldFallbacks[field] ?? 'Check this field'
  }
  return fieldErrors
}

// turns any thrown error into what the form should show: a banner, field messages, or both
export function describeError(error: unknown): { formError: string | null, fieldErrors: FieldErrors } {
  if(error instanceof ApiRequestError) {
    if(error.status === 400) {
      const fieldErrors = parseInvalidFields(error.message)
      if(fieldErrors) return { formError: null, fieldErrors }
    }
    if(error.status === 429) {
      return { formError: 'Too many attempts. Take a short break and try again in a few minutes.', fieldErrors: {} }
    }
    if(error.status >= 500 || error.status === 0) {
      return { formError: 'Something went wrong on our side. Please try again in a moment.', fieldErrors: {} }
    }
    return { formError: error.message, fieldErrors: {} }
  }
  // fetch rejects with a TypeError when the network is down or the request never left the browser
  if(error instanceof TypeError) {
    return { formError: 'Can\'t reach CKAuth right now. Check your connection and try again.', fieldErrors: {} }
  }
  return { formError: error instanceof Error ? error.message : 'Something went wrong, please try again', fieldErrors: {} }
}
