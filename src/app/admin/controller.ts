import type {Request, Response} from 'express'
// native bcrypt hashes on libuv's thread pool, so password checks don't block other requests
import bcrypt from 'bcrypt'

import { inviteUserPayloadModel, listUsersQueryModel, reauthPayloadModel, userIdParamsModel } from './models.js';
import { db } from '../../db/index.js';
import { sessionsTable, usersTable } from '../../db/schema.js';
import { and, count, desc, eq, gte, ilike, ne, or, sql } from 'drizzle-orm';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { ADMIN_REAUTH_WINDOW_MS, getFrontendUrl, INVITE_LINK_LIFETIME_MS, userRolesEnum } from '../auth/utils/constants.js';
import { createTempToken } from '../auth/controller.js';
import { deleteImage } from '../../utils/imagekit.js';
import { sendAccountDeletedMail, sendInviteMail } from '../../utils/mail.js';

// only fields an admin needs to see; never passwords, token hashes or the ImageKit file id
const adminUserFields = {
  id: usersTable.id,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  age: usersTable.age,
  email: usersTable.email,
  emailVerified: usersTable.emailVerified,
  role: usersTable.role,
  avatarUrl: usersTable.avatarUrl,
  createdAt: usersTable.createdAt,
  // from the user's live sessions, one subquery each per row on a page of at most 100; the sessions_user_id_idx index serves them.
  // the times only, never the browser or ip: an admin needs to know an account is in use, not where from
  // table-qualified by hand: drizzle prints bare column names in a raw subquery, and a bare "id" there means sessions.id,
  // which matched no user at all. mapWith(column) reuses the column's decoding, which reads the zone-less timestamp as utc
  lastActiveAt: sql<Date | null>`(select max(s.last_used_at) from sessions s where s.user_id = "users"."id" and s.expires_at > now())`.mapWith(sessionsTable.lastUsedAt),
  deviceCount: sql<number>`(select count(*) from sessions s where s.user_id = "users"."id" and s.expires_at > now())`.mapWith(Number),
}

// % and _ are wildcards in LIKE; escaped, so a search for "a_b" finds "a_b" and not "axb"
function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`
}

export class AdminController {

  public async handleStats(req: Request, res: Response) {
    const weekAgo = new Date(Date.now() - (7*24*60*60*1000))

    // one pass over the table, so every number comes from the same snapshot; count() skips the nulls the case returns
    const [stats] = await db.select({
      totalUsers: count(),
      verifiedUsers: count(sql`case when ${usersTable.emailVerified} then 1 end`),
      admins: count(sql`case when ${eq(usersTable.role, userRolesEnum.ADMIN)} then 1 end`),
      newThisWeek: count(sql`case when ${gte(usersTable.createdAt, weekAgo)} then 1 end`),
    }).from(usersTable)

    return ApiResponse.ok(res, 'Stats fetched successfully', stats)
  }

  public async handleListUsers(req: Request, res: Response) {
    const validationResult = await listUsersQueryModel.safeParseAsync(req.query)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {page, limit, search} = validationResult.data

    const filter = search
      ? or(ilike(usersTable.email, likePattern(search)), ilike(usersTable.firstName, likePattern(search)), ilike(usersTable.lastName, likePattern(search)))
      : undefined

    // newest first; id breaks ties so a page never repeats or skips a user who signed up in the same instant
    const [users, [total]] = await Promise.all([
      db.select(adminUserFields).from(usersTable).where(filter).orderBy(desc(usersTable.createdAt), desc(usersTable.id)).limit(limit).offset((page - 1) * limit),
      db.select({count: count()}).from(usersTable).where(filter)
    ])

    return ApiResponse.ok(res, 'Users fetched successfully', {
      users,
      pagination: {page, limit, total: total?.count ?? 0}
    })
  }

  public async handleReauth(req: Request, res: Response) {
    const validationResult = await reauthPayloadModel.safeParseAsync(req.body)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const userId = (req.user as any)?.id
    const [userInDb] = await db.select({password: usersTable.password}).from(usersTable).where(eq(usersTable.id, userId))

    // 400 rather than 401: the session is fine, only the password is wrong, and a 401 would make the frontend try a refresh
    const isPasswordValid = userInDb?.password ? await bcrypt.compare(validationResult.data.password, userInDb.password) : false
    if(!isPasswordValid) {
      throw ApiError.badRequest('Incorrect password')
    }

    const now = new Date()
    await db.update(sessionsTable).set({reauthenticatedAt: now}).where(eq(sessionsTable.id, req.sessionId!))

    return ApiResponse.ok(res, 'Password confirmed', {expiresAt: new Date(now.getTime() + ADMIN_REAUTH_WINDOW_MS)})
  }

  public async handleInviteUser(req: Request, res: Response) {
    const validationResult = await inviteUserPayloadModel.safeParseAsync(req.body)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {firstName, lastName, email} = validationResult.data
    // the person chooses their own password from the emailed link (the reset flow), so the admin never knows it,
    // and opening the link proves the inbox, which verifies the account. no password until then, so nobody can sign in to it
    const {token, hashedToken} = await createTempToken()

    // a clear 409 is fine here (unlike sign-up), because admins can already see every account
    const [invited] = await db.insert(usersTable).values({
      firstName,
      lastName,
      email,
      resetPasswordToken: hashedToken,
      resetPasswordTokenExpiry: new Date(Date.now() + INVITE_LINK_LIFETIME_MS),
    })
    .onConflictDoNothing({ target: usersTable.email })
    .returning(adminUserFields)

    if(!invited) {
      throw ApiError.conflict('A user with this email already exists')
    }

    // the admin can delete and re-invite if the mail never arrives
    const setPasswordUrl = `${getFrontendUrl()}/reset-password?token=${token}&invite=1`
    sendInviteMail(email, firstName, setPasswordUrl, INVITE_LINK_LIFETIME_MS / (60 * 60 * 1000)).catch((error) => {
      console.error(`Failed to send invite mail to ${email}:`, error)
    })

    return ApiResponse.created(res, 'Invite sent', invited)
  }

  public async handleDeleteUser(req: Request, res: Response) {
    const validationResult = await userIdParamsModel.safeParseAsync(req.params)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {id} = validationResult.data
    const adminId = (req.user as any)?.id

    // admins can't remove themselves or each other here; removing an admin is done on the server (src/scripts/manage-users.ts),
    // so a stolen admin session can't lock the real admins out
    if(id === adminId) {
      throw ApiError.forbidden('Not to be deleted: an admin cannot delete their own account')
    }

    // the role check is part of the delete, so a user promoted to admin between a check and the delete can't slip through.
    // deleting the row also ends the user's sessions: /refresh can't find the token, and authenticateToken can't find the user
    const [deletedUser] = await db.delete(usersTable)
      .where(and(eq(usersTable.id, id), ne(usersTable.role, userRolesEnum.ADMIN)))
      .returning({id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, emailVerified: usersTable.emailVerified, avatarFileId: usersTable.avatarFileId})

    // nothing deleted: either there is no such user, or it's an admin; one extra read tells the two apart for the response
    if(!deletedUser) {
      const [userInDb] = await db.select({role: usersTable.role}).from(usersTable).where(eq(usersTable.id, id))
      if(userInDb) {
        throw ApiError.forbidden('Not to be deleted: an admin cannot delete another admin account')
      }
      throw ApiError.notFound('User not found')
    }

    // the account is already gone, so a failure to remove the avatar file or send the mail shouldn't fail the request
    if(deletedUser.avatarFileId) {
      deleteImage(deletedUser.avatarFileId).catch((error) => {
        console.error(`Failed to delete avatar ${deletedUser.avatarFileId} from ImageKit:`, error)
      })
    }

    // only a verified address is known to belong to the person; an unconfirmed one may be someone else's inbox
    if(deletedUser.emailVerified) {
      sendAccountDeletedMail(deletedUser.email, deletedUser.firstName, `${getFrontendUrl()}/privacy`).catch((error) => {
        console.error(`Failed to send account deleted mail to ${deletedUser.email}:`, error)
      })
    }

    return ApiResponse.ok(res, 'User deleted successfully', {id: deletedUser.id})
  }

}
