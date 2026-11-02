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
export const signupPayloadModel = z.object({
  firstName: z.string().trim().min(2).max(45),
  lastName: z.string().trim().max(45).nullable().optional(),
  age: z.number().int().positive().optional(),
  email: emailModel,
  password: z.string().min(6).max(72)
})

export const signinPayloadModel = z.object({
  email: emailModel,
  password: z.string().min(6)
})

// the password is checked on verify, so only the person who chose it at signup and also owns the inbox can verify the account
export const verifyEmailPayloadModel = z.object({
  token: z.string().min(1).max(100),
  password: z.string().min(1).max(72)
})

export const reqUserModel = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(2),
  lastName: z.string().nullable().optional(),
  age: z.number().int().positive().optional().nullable(),
  email: z.email(),
  emailVerified: z.boolean(),
  role: z.enum(availableUserRoles),
  avatarUrl: z.string().nullable()
})

export const forgotPasswordPayloadModel = z.object({
  email: emailModel
})

// add a model for the reset password payload, which includes the token in params  and the new password in req.body
export const resetPasswordPayloadModel = z.object({
  token: z.string().min(1).max(100),
  newPassword: z.string().min(6).max(72)
})
// currentPassword only needs to be present, so older passwords that predate the current rules still work
export const changePasswordPayloadModel = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(6).max(72)
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from the current password',
  path: ['newPassword']
})
