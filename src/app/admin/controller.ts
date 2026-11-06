import type {Request, Response} from 'express'
// native bcrypt hashes on libuv's thread pool, so password checks don't block other requests
import bcrypt from 'bcrypt'

import { inviteUserPayloadModel, listActivityQueryModel, listUsersQueryModel, reauthPayloadModel, userIdParamsModel } from './models.js';
import { db } from '../../db/index.js';
import { auditEventsTable, referralVisitsTable, sessionsTable, usersTable } from '../../db/schema.js';
import { and, count, desc, eq, gte, ilike, isNotNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { parseOrThrow } from '../../utils/validate.js';
import { ADMIN_REAUTH_WINDOW_MS, auditActions, getFrontendUrl, INVITE_LINK_LIFETIME_MS, userRolesEnum } from '../auth/utils/constants.js';
import { recordEvent } from '../auth/utils/audit.js';
import { createTempToken } from '../auth/utils/tokens.js';
import { safeUserColumns } from '../auth/utils/user-columns.js';
import { deleteImage } from '../../utils/imagekit.js';
import { sendAccountDeletedMail, sendInviteMail } from '../../utils/mail.js';

// what the user sees about themselves, plus activity
const adminUserFields = {
  ...safeUserColumns,
  // from the user's live sessions, one subquery each per row on a page of at most 100; the sessions_user_id_idx index serves them.
  // the times only, never the browser or ip: an admin needs to know an account is in use, not where from
  // table-qualified by hand: drizzle prints bare column names in a raw subquery, and a bare "id" there means sessions.id,
  // which matched no user at all. mapWith(column) reuses the column's decoding, which reads the zone-less timestamp as utc
  lastActiveAt: sql<Date | null>`(select max(s.last_used_at) from sessions s where s.user_id = "users"."id" and s.expires_at > now())`.mapWith(sessionsTable.lastUsedAt),
  deviceCount: sql<number>`(select count(*) from sessions s where s.user_id = "users"."id" and s.expires_at > now())`.mapWith(Number),
}

// the same users table joined twice, once for who acted and once for whose account it was
const actorUsers = alias(usersTable, 'actor_users')
const targetUsers = alias(usersTable, 'target_users')

// what an admin sees of an event. no ip address, like the users list: an admin needs to know what happened and to whom,
// not where people are; the ip stays in the table for the server's operator. a deleted user's join comes back null,
// and the panel falls back to details.email
const activityFields = {
  id: auditEventsTable.id,
  action: auditEventsTable.action,
  source: auditEventsTable.source,
  details: auditEventsTable.details,
  requestId: auditEventsTable.requestId,
  createdAt: auditEventsTable.createdAt,
  actorId: auditEventsTable.actorId,
  targetId: auditEventsTable.targetId,
  actorEmail: actorUsers.email,
  actorFirstName: actorUsers.firstName,
  targetEmail: targetUsers.email,
  targetFirstName: targetUsers.firstName,
}

// % and _ are wildcards in LIKE; escaped, so a search for "a_b" finds "a_b" and not "axb"
function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, character => `\\${character}`)}%`
}

export class AdminController {

  public async handleStats(req: Request, res: Response) {
    // rolling windows back from now, so "this week" is the last 7 days, not since monday
    const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // one pass over the table, so every number comes from the same snapshot; count() skips the nulls the case returns
    const [stats] = await db.select({
      totalUsers: count(),
      verifiedUsers: count(sql`case when ${usersTable.emailVerified} then 1 end`),
      admins: count(sql`case when ${eq(usersTable.role, userRolesEnum.ADMIN)} then 1 end`),
      newLast24Hours: count(sql`case when ${gte(usersTable.createdAt, ago(1))} then 1 end`),
      newThisWeek: count(sql`case when ${gte(usersTable.createdAt, ago(7))} then 1 end`),
      newThisMonth: count(sql`case when ${gte(usersTable.createdAt, ago(30))} then 1 end`),
      newThisYear: count(sql`case when ${gte(usersTable.createdAt, ago(365))} then 1 end`),
    }).from(usersTable)

    // the last 30 days per tagged source: visits from the daily counters, sign-ups and confirmed ones from the users
    // who arrived with that ref. a deleted account drops out of its source, the visit stays
    const since = ago(30)
    const [visits, signUps] = await Promise.all([
      db.select({source: referralVisitsTable.source, visits: sql<number>`sum(${referralVisitsTable.visits})::int`})
        .from(referralVisitsTable)
        .where(gte(referralVisitsTable.day, since.toISOString().slice(0, 10)))
        .groupBy(referralVisitsTable.source),
      db.select({
        source: usersTable.signupSource,
        signUps: count(),
        verified: count(sql`case when ${usersTable.emailVerified} then 1 end`),
      }).from(usersTable)
        .where(and(isNotNull(usersTable.signupSource), gte(usersTable.createdAt, since)))
        .groupBy(usersTable.signupSource),
    ])

    const sources = new Set([...visits.map(row => row.source), ...signUps.map(row => row.source!)])
    const referrals = [...sources].sort().map(source => ({
      source,
      visits: visits.find(row => row.source === source)?.visits ?? 0,
      signUps: signUps.find(row => row.source === source)?.signUps ?? 0,
      verified: signUps.find(row => row.source === source)?.verified ?? 0,
    }))

    return ApiResponse.ok(res, 'Stats fetched successfully', {...stats, referrals})
  }

  public async handleListUsers(req: Request, res: Response) {

    const {page, limit, search} = await parseOrThrow(listUsersQueryModel, req.query)

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
    const {password} = await parseOrThrow(reauthPayloadModel, req.body)
    const userId = (req.user as any)?.id
    const [userInDb] = await db.select({password: usersTable.password}).from(usersTable).where(eq(usersTable.id, userId))

    // 400 rather than 401: the session is fine, only the password is wrong, and a 401 would make the frontend try a refresh
    const isPasswordValid = userInDb?.password ? await bcrypt.compare(password, userInDb.password) : false
    // a wrong password from a signed-in admin session is the first sign of a stolen cookie, so it's recorded
    if(!isPasswordValid) {
      await recordEvent(db, req, {action: auditActions.ADMIN_REAUTH_FAILED, actorId: userId, targetId: userId})
      throw ApiError.badRequest('Incorrect password')
    }

    const now = new Date()
    await db.transaction(async (tx) => {
      await tx.update(sessionsTable).set({reauthenticatedAt: now}).where(eq(sessionsTable.id, req.sessionId!))
      await recordEvent(tx, req, {action: auditActions.ADMIN_REAUTH, actorId: userId, targetId: userId})
    })

    return ApiResponse.ok(res, 'Password confirmed', {expiresAt: new Date(now.getTime() + ADMIN_REAUTH_WINDOW_MS)})
  }

  public async handleInviteUser(req: Request, res: Response) {

    const {firstName, lastName, email} = await parseOrThrow(inviteUserPayloadModel, req.body)
    // the person chooses their own password from the emailed link (the reset flow), so the admin never knows it,
    // and opening the link proves the inbox, which verifies the account. no password until then, so nobody can sign in to it
    const {token, hashedToken} = createTempToken()

    // a clear 409 is fine here (unlike sign-up), because admins can already see every account
    const invited = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(usersTable).values({
        firstName,
        lastName,
        email,
        resetPasswordToken: hashedToken,
        resetPasswordTokenExpiry: new Date(Date.now() + INVITE_LINK_LIFETIME_MS),
      })
      .onConflictDoNothing({ target: usersTable.email })
      .returning(adminUserFields)

      if(inserted) {
        await recordEvent(tx, req, {action: auditActions.USER_INVITED, actorId: (req.user as any)?.id, targetId: inserted.id})
      }
      return inserted
    })

    if(!invited) {
      throw ApiError.conflict('A user with this email already exists')
    }

    // the admin can delete and re-invite if the mail never arrives
    const setPasswordUrl = `${getFrontendUrl()}/reset-password?token=${token}&invite=1`
    sendInviteMail(email, firstName, setPasswordUrl, INVITE_LINK_LIFETIME_MS / (60 * 60 * 1000)).catch((error) => {
      req.log.error({err: error, mail: 'invite', userId: invited.id}, 'mail failed')
    })

    return ApiResponse.created(res, 'Invite sent', invited)
  }

  public async handleDeleteUser(req: Request, res: Response) {

    const {id} = await parseOrThrow(userIdParamsModel, req.params)
    const adminId = (req.user as any)?.id

    // admins can't remove themselves or each other here; removing an admin is done on the server (src/scripts/manage-users.ts),
    // so a stolen admin session can't lock the real admins out
    if(id === adminId) {
      throw ApiError.forbidden('Not to be deleted: an admin cannot delete their own account')
    }

    // the role check is part of the delete, so a user promoted to admin between a check and the delete can't slip through.
    // deleting the row also ends the user's sessions: /refresh can't find the token, and authenticateToken can't find the user
    // the email is kept on the event, since the account it belonged to is gone
    const deletedUser = await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(usersTable)
        .where(and(eq(usersTable.id, id), ne(usersTable.role, userRolesEnum.ADMIN)))
        .returning({id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, emailVerified: usersTable.emailVerified, avatarFileId: usersTable.avatarFileId})

      if(deleted) {
        await recordEvent(tx, req, {action: auditActions.USER_DELETED, actorId: adminId, targetId: deleted.id, details: {email: deleted.email}})
      }
      return deleted
    })

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
        req.log.error({err: error, fileId: deletedUser.avatarFileId}, 'deleted account avatar delete failed')
      })
    }

    // only a verified address is known to belong to the person; an unconfirmed one may be someone else's inbox
    if(deletedUser.emailVerified) {
      sendAccountDeletedMail(deletedUser.email, deletedUser.firstName, `${getFrontendUrl()}/privacy`).catch((error) => {
        req.log.error({err: error, mail: 'account-deleted', userId: deletedUser.id}, 'mail failed')
      })
    }

    return ApiResponse.ok(res, 'User deleted successfully', {id: deletedUser.id})
  }

  public async handleListActivity(req: Request, res: Response) {

    const {page, limit, action, userId} = await parseOrThrow(listActivityQueryModel, req.query)

    // one person's activity is everything they did and everything done to their account
    const filter = and(
      action ? eq(auditEventsTable.action, action) : undefined,
      userId ? or(eq(auditEventsTable.actorId, userId), eq(auditEventsTable.targetId, userId)) : undefined,
    )

    // newest first, with id breaking ties like the users list; audit_events_created_at_idx serves the order
    const [events, [total]] = await Promise.all([
      db.select(activityFields).from(auditEventsTable)
        .leftJoin(actorUsers, eq(actorUsers.id, auditEventsTable.actorId))
        .leftJoin(targetUsers, eq(targetUsers.id, auditEventsTable.targetId))
        .where(filter)
        .orderBy(desc(auditEventsTable.createdAt), desc(auditEventsTable.id))
        .limit(limit).offset((page - 1) * limit),
      db.select({count: count()}).from(auditEventsTable).where(filter)
    ])

    return ApiResponse.ok(res, 'Activity fetched successfully', {
      events,
      pagination: {page, limit, total: total?.count ?? 0}
    })
  }

}
