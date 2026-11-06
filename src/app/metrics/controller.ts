import type {Request, Response} from 'express'
import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { referralVisitsTable } from '../../db/schema.js'
import { ApiResponse } from '../../utils/api-response.js'
import { parseOrThrow } from '../../utils/validate.js'
import { visitPayloadModel } from './models.js'

export class MetricsController {

  public async handleVisit(req: Request, res: Response) {
    const {ref} = await parseOrThrow(visitPayloadModel, req.body)

    // same answer for a known and an unknown source, so the endpoint doesn't list our campaigns to whoever probes it
    if(ref) {
      // one row per source per day; the conflict adds one in the same statement, so two visits at once both count
      await db.insert(referralVisitsTable).values({source: ref, visits: 1})
        .onConflictDoUpdate({
          target: [referralVisitsTable.day, referralVisitsTable.source],
          set: {visits: sql`${referralVisitsTable.visits} + 1`}
        })
    }

    return ApiResponse.ok(res, 'Visit recorded')
  }
}
