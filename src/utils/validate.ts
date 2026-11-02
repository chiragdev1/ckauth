import type { z } from 'zod'
import { ApiError } from './api-error.js'

// every handler validates its input the same way, and the frontend (frontend/src/lib/validation.ts, parseInvalidFields)
// reads the message format to put each error on its field, so the format lives in one place
export async function parseOrThrow<T extends z.ZodType>(model: T, input: unknown): Promise<z.output<T>> {
  const result = await model.safeParseAsync(input)

  // only the path and zod's message, never the received value: it could be a password
  if(!result.success) {
    throw ApiError.badRequest(`Invalid input fields: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
  }

  // the parsed data, not the input: the models trim and lowercase, so only this is what was validated
  return result.data
}
