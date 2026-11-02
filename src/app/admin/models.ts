import {z} from 'zod'
import { emailModel, existingPasswordModel, firstNameModel, lastNameModel } from '../auth/models.js'

// query strings are always text, so coerce the numbers; limit is capped so one request can't read the whole table
const pageQueryModel = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const listUsersQueryModel = pageQueryModel.extend({
  // matched against name and email; trimmed, and empty means no filter
  search: z.string().trim().max(100).optional()
})

// an invite carries no password (the person chooses it from the emailed link) and no role: admins are made only on the server.
// strict, so a client sending password or role gets a 400 instead of having it silently ignored
export const inviteUserPayloadModel = z.object({
  firstName: firstNameModel,
  lastName: lastNameModel,
  email: emailModel,
}).strict()

export const reauthPayloadModel = z.object({
  password: existingPasswordModel
})

export const userIdParamsModel = z.object({
  id: z.uuid('Invalid user id')
})
