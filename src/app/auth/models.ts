import {z} from 'zod'
import { availableUserRoles } from './utils/constants.js'

// normalize before validating so " John@Gmail.com " and "john@gmail.com" map to the same account
// 254 is the max length of a valid email address (RFC 5321)
export const emailModel = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email must be at most 254 characters')
  .pipe(z.email('Invalid email address'))

// max lengths match the varchar(45) columns in the users table
export const firstNameModel = z.string().trim().min(2).max(45)
export const lastNameModel = z.string().trim().max(45).nullable().optional()
const ageModel = z.number().int().positive()

// a password that already exists only needs to be present, so older passwords that predate the current rules still work;
// 72 is bcrypt's limit, past which it ignores the rest
export const existingPasswordModel = z.string().min(1).max(72)
const newPasswordModel = z.string().min(6).max(72)

// the random token from an email link (64 hex characters today); the cap only stops a huge string reaching the hash
const linkTokenModel = z.string().min(1).max(100)

export const signupPayloadModel = z.object({
  firstName: firstNameModel,
  lastName: lastNameModel,
  age: ageModel.optional(),
  email: emailModel,
  password: newPasswordModel
})

export const signinPayloadModel = z.object({
  email: emailModel,
  password: z.string().min(6)
})

// the password is checked on verify, so only the person who chose it at signup and also owns the inbox can verify the account
export const verifyEmailPayloadModel = z.object({
  token: linkTokenModel,
  password: existingPasswordModel
})

export const reqUserModel = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(2),
  lastName: z.string().nullable().optional(),
  age: ageModel.nullable().optional(),
  email: z.email(),
  emailVerified: z.boolean(),
  role: z.enum(availableUserRoles),
  avatarUrl: z.string().nullable(),
  createdAt: z.date()
})

export const forgotPasswordPayloadModel = z.object({
  email: emailModel
})

// the token comes from the url, the new password from the body
export const resetPasswordPayloadModel = z.object({
  token: linkTokenModel,
  newPassword: newPasswordModel
})

export const changePasswordPayloadModel = z.object({
  currentPassword: existingPasswordModel,
  newPassword: newPasswordModel
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from the current password',
  path: ['newPassword']
})

export const resendVerificationPayloadModel = z.object({
  email: emailModel
})

// strict, so a client can't slip email, role or anything else into a profile edit; the email has its own (future) flow
export const updateProfilePayloadModel = z.object({
  firstName: firstNameModel.optional(),
  lastName: lastNameModel,
  age: ageModel.nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, {
  message: 'Send at least one field to change'
})

// deleting can't be undone, so a stolen session alone isn't enough: the password must be typed again
export const deleteAccountPayloadModel = z.object({
  password: existingPasswordModel
})

export const sessionIdParamsModel = z.object({
  id: z.uuid()
})

// the password again, like deleting: a stolen session alone mustn't be able to move the account to another inbox
export const changeEmailPayloadModel = z.object({
  newEmail: emailModel,
  password: existingPasswordModel
})

export const confirmEmailChangePayloadModel = z.object({
  token: linkTokenModel
})
