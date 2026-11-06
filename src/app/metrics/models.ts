import {z} from 'zod'
import { normalizeRefSource } from './sources.js'

// any ref is accepted and an unknown one becomes null, so the page never sees an error for a link someone retyped
export const refModel = z.unknown().transform(normalizeRefSource)

export const visitPayloadModel = z.object({
  ref: refModel
})
