import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { sessionsTable } from '../../db/schema.js'
import { ApiError } from '../../utils/api-error.js'
import { ADMIN_REAUTH_WINDOW_MS } from '../auth/utils/constants.js'

// "sudo mode": admin writes need the admin's password confirmed recently (POST /admin/reauth), so a stolen session cookie
// alone can't invite or delete anyone. runs after authenticateToken and authorizeRoles
export async function requireRecentReauth(req: Request, res: Response, next: NextFunction) {
  // per session, so confirming the password on one device doesn't unlock admin writes on another
  const [session] = await db.select({reauthenticatedAt: sessionsTable.reauthenticatedAt}).from(sessionsTable).where(eq(sessionsTable.id, req.sessionId!))

  const confirmedAt = session?.reauthenticatedAt?.getTime() ?? 0
  if(Date.now() - confirmedAt > ADMIN_REAUTH_WINDOW_MS) {
    // the code tells the frontend to ask for the password and retry, rather than show an error
    throw new ApiError(403, 'Confirm your password to continue', 'REAUTH_REQUIRED')
  }

  next()
}
