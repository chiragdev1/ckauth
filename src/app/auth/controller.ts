import type {Request, Response} from 'express'
// native bcrypt hashes on libuv's thread pool, so password checks don't block other requests
import bcrypt from 'bcrypt'
import crypto from 'crypto'

import { changeEmailPayloadModel, changePasswordPayloadModel, confirmEmailChangePayloadModel, deleteAccountPayloadModel, forgotPasswordPayloadModel, resendVerificationPayloadModel, resetPasswordPayloadModel, signinPayloadModel, signupPayloadModel, sessionIdParamsModel, updateProfilePayloadModel, verifyEmailPayloadModel } from './models.js';
import { db } from '../../db/index.js';
import { sessionsTable, usersTable } from '../../db/schema.js';
import { and, desc, eq, gt, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, getTokenExpiry, verifyRefreshToken } from './utils/jwt-token.js';
import { clearSessionCookies, describeClient, setSessionCookies, startSession } from './utils/sessions.js';
import { createTempToken, hashToken } from './utils/tokens.js';
import { safeUserColumns } from './utils/user-columns.js';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { parseOrThrow } from '../../utils/validate.js';
import { getFrontendUrl, PASSWORD_HASH_ROUNDS, userRolesEnum } from './utils/constants.js';
import { sendAccountDeletedMail, sendAccountExistsMail, sendConfirmEmailChangeMail, sendEmailChangedMail, sendEmailChangeRequestedMail, sendEmailTakenMail, sendNewSignInMail, sendEmailVerificationMail, sendResetPasswordMail, sendWelcomeMail } from '../../utils/mail.js';
import { deleteImage, uploadImage } from '../../utils/imagekit.js';
import { describeDevice } from '../../utils/device.js';

// hash of a random value nobody knows, made once at startup; compared against when an email has no account
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), PASSWORD_HASH_ROUNDS)

// how long a verification link works; the same for sign-up, sign-in and resend
const VERIFICATION_LINK_MS = 15 * 60 * 1000

const RESET_LINK_MS = 15 * 60 * 1000

// at most one "someone tried to sign up with your email" mail per this long, so the inbox can't be flooded
const ACCOUNT_EXISTS_MAIL_COOLDOWN_MS = 15 * 60 * 1000

// longer than the 15-minute links: the new inbox may be one the person checks less often
const EMAIL_CHANGE_LINK_MS = 60 * 60 * 1000

// how long after a verification mail before resend sends another; the frontend counts down the same 60 seconds
const RESEND_COOLDOWN_MS = 60 * 1000

function verificationUrl(token: string) {
  return `${getFrontendUrl()}/verify-email?token=${token}`
}

export class AuthController {

  public async handleSignup(req: Request, res: Response) {
    const {firstName, lastName, age, email, password} = await parseOrThrow(signupPayloadModel, req.body)

    // same response whether or not the email is already registered, so this endpoint can't be used to check which emails have accounts;
    // the difference is only explained in the mail, which only the owner of the email can read
    const genericMessage = 'Check your email to finish creating your account'

    // hash the password before checking the email, so both cases take about the same time
    const hash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS)

    const {token: emailVerificationToken, hashedToken: hashedEmailVerificationToken} = createTempToken()
    const emailVerificationTokenExpiry = new Date(Date.now() + VERIFICATION_LINK_MS)
    const link = verificationUrl(emailVerificationToken)

    // save the fields to the user; the unique email constraint decides if the account is new, so two signups at once can't both create it
    const [result] = await db.insert(usersTable).values({
      firstName,
      lastName,
      age,
      email,
      password: hash,
      emailVerificationToken: hashedEmailVerificationToken,
      emailVerificationTokenExpiry
    })
    .onConflictDoNothing({ target: usersTable.email })
    .returning({ id: usersTable.id })

    // new account: send the verification mail; the user can get a new one by signing up or signing in again if this fails
    if(result) {
      sendEmailVerificationMail(email, link).catch((error) => {
        console.error(`Failed to send verification mail to ${email}:`, error)
      })
      return ApiResponse.created(res, genericMessage)
    }

    // no row returned means the email is already registered
    const now = new Date()

    // not verified yet: whoever controls the inbox hasn't claimed it, so the latest signup replaces the details and gets a new link.
    // only once the last link has expired, so a signup can't swap the password under a link that is still in the owner's inbox.
    // an unverified account never has a session (sign-in refuses it), so there is nobody to sign out
    const [unverifiedUser] = await db.update(usersTable).set({
      firstName,
      lastName: lastName ?? null,
      age: age ?? null,
      password: hash,
      emailVerificationToken: hashedEmailVerificationToken,
      emailVerificationTokenExpiry,
    })
    .where(and(
      eq(usersTable.email, email),
      eq(usersTable.emailVerified, false),
      or(isNull(usersTable.emailVerificationTokenExpiry), lt(usersTable.emailVerificationTokenExpiry, now))
    ))
    .returning({id: usersTable.id})

    if(unverifiedUser) {
      sendEmailVerificationMail(email, link).catch((error) => {
        console.error(`Failed to send verification mail to ${email}:`, error)
      })
      return ApiResponse.created(res, genericMessage)
    }

    // verified: tell the owner someone tried to sign up with their email, at most once per cooldown.
    // the check and the update are one query, so parallel signups can't both send the mail
    const accountExistsMailCooldown = new Date(now.getTime() - ACCOUNT_EXISTS_MAIL_COOLDOWN_MS)

    const [verifiedUser] = await db.update(usersTable).set({accountExistsMailSentAt: now})
    .where(and(
      eq(usersTable.email, email),
      eq(usersTable.emailVerified, true),
      or(isNull(usersTable.accountExistsMailSentAt), lt(usersTable.accountExistsMailSentAt, accountExistsMailCooldown))
    ))
    .returning({firstName: usersTable.firstName})

    if(verifiedUser) {
      sendAccountExistsMail(email, verifiedUser.firstName, `${getFrontendUrl()}/sign-in`, `${getFrontendUrl()}/forgot-password`).catch((error) => {
        console.error(`Failed to send account exists mail to ${email}:`, error)
      })
    }

    // any other case (unverified with a link still valid, or a mail sent recently) sends nothing, but the response is the same
    return ApiResponse.created(res, genericMessage)
  }

  public async handleSignin(req: Request, res: Response) {
    const {email, password} = await parseOrThrow(signinPayloadModel, req.body)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.email, email))

    // still run a bcrypt compare when there is no account, otherwise the faster response would reveal that the email isn't registered
    if(!userInDb || !userInDb.password) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
      throw ApiError.unauthorized('Invalid email or password')
    }

    const isPasswordValid = await bcrypt.compare(password, userInDb.password)

    if(!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    // no session until the email is verified, so nobody can get into an account before the inbox owner has claimed it
    if(!userInDb.emailVerified) {
      const {token: emailVerificationToken, hashedToken: hashedEmailVerificationToken} = createTempToken()
      const emailVerificationTokenExpiry = new Date(Date.now() + VERIFICATION_LINK_MS)

      // send a new link only if the last one has expired, so signing in repeatedly doesn't send a new mail every time;
      // the check and the update are one query, so parallel sign ins can't both send it
      const [linkRenewed] = await db.update(usersTable).set({emailVerificationToken: hashedEmailVerificationToken, emailVerificationTokenExpiry})
      .where(and(
        eq(usersTable.id, userInDb.id),
        or(isNull(usersTable.emailVerificationTokenExpiry), lt(usersTable.emailVerificationTokenExpiry, new Date()))
      ))
      .returning({id: usersTable.id})

      // a mail failure shouldn't change the response
      if(linkRenewed) {
        sendEmailVerificationMail(userInDb.email, verificationUrl(emailVerificationToken)).catch((error) => {
          console.error(`Failed to send verification mail to ${userInDb.email}:`, error)
        })
      }

      throw ApiError.forbidden('Please verify your email before signing in, check your inbox for the verification link')
    }

    // a browser with no live session on this account is worth telling the owner about; signing in again on the same laptop isn't
    const client = describeClient(req)
    const [knownBrowser] = await db.select({id: sessionsTable.id}).from(sessionsTable)
      .where(and(
        eq(sessionsTable.userId, userInDb.id),
        client.userAgent ? eq(sessionsTable.userAgent, client.userAgent) : isNull(sessionsTable.userAgent),
        gt(sessionsTable.expiresAt, new Date()),
      ))
      .limit(1)

    // a new session for this device; sessions on other devices carry on
    const tokens = await startSession(db, userInDb.id, req)
    setSessionCookies(res, tokens)

    if(!knownBrowser) {
      sendNewSignInMail(userInDb.email, userInDb.firstName, describeDevice(client.userAgent), client.ipAddress, `${getFrontendUrl()}/dashboard#devices`, `${getFrontendUrl()}/forgot-password`).catch((error) => {
        console.error(`Failed to send new sign-in mail to ${userInDb.email}:`, error)
      })
    }

    return ApiResponse.ok(res, 'User signed in successfully', {id: userInDb.id})
  }

  public async handleVerifyEmail(req: Request, res: Response) {
    // the token from the url, the password from the body

    const {token, password} = await parseOrThrow(verifyEmailPayloadModel, {token: req.params.token, ...req.body})
    const hashedToken = hashToken(token)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.emailVerificationToken, hashedToken))

    const isTokenValid = userInDb && userInDb.emailVerificationTokenExpiry && userInDb.emailVerificationTokenExpiry > new Date()

    if(!userInDb || !isTokenValid) {
      throw ApiError.notFound('Invalid or expired email token')
    }

    // the link only proves the inbox; the password proves this is the same person who signed up,
    // so someone who signed up with another person's email can't get the account verified with their own password
    const isPasswordValid = userInDb.password ? await bcrypt.compare(password, userInDb.password) : false

    if(!isPasswordValid) {
      // cancel the link, so the inbox owner can sign up again straight away and replace the details instead of waiting for it to expire
      await db.update(usersTable).set({emailVerificationToken: null, emailVerificationTokenExpiry: null}).where(and(eq(usersTable.id, userInDb.id), eq(usersTable.emailVerificationToken, hashedToken)))
      throw ApiError.unauthorized('Incorrect password, this verification link has been cancelled. Sign up again or sign in to get a new link')
    }

    // the link and the password together prove both inbox and account, the same proof sign-in asks for, so verifying also starts a session.
    // mark the email verified and remove the token; matching on the token means a signup that replaced the details in the meantime
    // (and so the password just checked) makes this update do nothing. one transaction, so a verified account always has its session
    const verified = await db.transaction(async (tx) => {
      const [updateRes] = await tx
        .update(usersTable)
        .set({emailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiry: null})
        .where(and(eq(usersTable.id, userInDb.id), eq(usersTable.emailVerificationToken, hashedToken)))
        .returning({id: usersTable.id})

      // no row returned means the token was used or replaced since it was read
      if(!updateRes) {
        throw ApiError.notFound('Invalid or expired email token')
      }

      return {id: updateRes.id, tokens: await startSession(tx, updateRes.id, req)}
    })

    // cookies only once the transaction committed, so a lost race never hands out a session
    setSessionCookies(res, verified.tokens)

    // send welcome mail now that signup is complete; a mail failure shouldn't fail verification
    sendWelcomeMail(userInDb.email, userInDb.firstName).catch((error) => {
      console.error(`Failed to send welcome mail to ${userInDb.email}:`, error)
    })

    return ApiResponse.ok(res, 'Email verified successfully', {id: verified.id})
  }

  public async handleLogout(req: Request, res: Response) {
    // no auth middleware here, so logout still works after the access token has expired
    const refreshToken = req.cookies?.refresh_token

    // end this device's session; matching on the hash means only the owner of this token can end it. the access token
    // carries the session id, so it stops working at once, and sudo mode (stored on the session) ends with it
    if(refreshToken) {
      await db.delete(sessionsTable).where(eq(sessionsTable.refreshTokenHash, hashToken(refreshToken)))
    }

    // cleared even with no session row, so a browser holding a dead cookie is fixed too
    clearSessionCookies(res)

    return ApiResponse.ok(res, 'User logged out successfully')
  }

  public async handleMe(req: Request, res: Response) {
    // authenticateToken already read the safe fields from the database
    return ApiResponse.ok(res, 'User details fetched successfully', req.user)
  }

  public async handleListSessions(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    // the hash and sudo time stay on the server; the rest is what the device list needs
    const sessions = await db.select({
      id: sessionsTable.id,
      userAgent: sessionsTable.userAgent,
      ipAddress: sessionsTable.ipAddress,
      createdAt: sessionsTable.createdAt,
      lastUsedAt: sessionsTable.lastUsedAt,
      expiresAt: sessionsTable.expiresAt,
    }).from(sessionsTable)
      .where(and(eq(sessionsTable.userId, userId), gt(sessionsTable.expiresAt, new Date())))
      .orderBy(desc(sessionsTable.lastUsedAt))

    return ApiResponse.ok(res, 'Sessions fetched successfully', sessions.map(session => ({...session, current: session.id === req.sessionId})))
  }

  public async handleRevokeSession(req: Request, res: Response) {
    const {id} = await parseOrThrow(sessionIdParamsModel, req.params)
    const userId = (req.user as any)?.id

    // matching on the user too means nobody can end someone else's session, and a guessed id answers like a missing one
    const [revoked] = await db.delete(sessionsTable).where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId))).returning({id: sessionsTable.id})

    if(!revoked) {
      throw ApiError.notFound('Session not found')
    }

    // ending this device's own session is a sign out, so its cookies go too
    if(revoked.id === req.sessionId) {
      clearSessionCookies(res)
    }

    return ApiResponse.ok(res, 'Session ended successfully', {id: revoked.id})
  }

  public async handleRevokeOtherSessions(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    const revoked = await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, userId), ne(sessionsTable.id, req.sessionId!))).returning({id: sessionsTable.id})

    return ApiResponse.ok(res, 'Other sessions ended successfully', {count: revoked.length})
  }

  public async handleRefresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token

    if(!refreshToken) {
      // the code tells a client "never signed in" apart from "signed in, but the session ended", without parsing the message
      throw new ApiError(401, "Refresh token not provided", 'NO_SESSION')
    }

    const {userId} = verifyRefreshToken(refreshToken)

    const hashedRefreshToken = hashToken(refreshToken)

    // the session and its user in one read
    const [found] = await db.select({session: sessionsTable, emailVerified: usersTable.emailVerified})
      .from(sessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
      .where(eq(sessionsTable.refreshTokenHash, hashedRefreshToken))

    // the token's user must also be the session's, so a valid token can't be paired with another user's session row
    if(!found || found.session.userId !== userId || found.session.expiresAt < new Date()) {
      throw ApiError.unauthorized("Invalid or expired refresh token")
    }

    // sessions from before sign in required a verified email can't be renewed
    if(!found.emailVerified) {
      throw ApiError.forbidden("Please verify your email before signing in")
    }

    // rotate: the old refresh token stops working the moment this one is issued
    const newRefreshToken = generateRefreshToken({userId})
    const newAccessToken = generateAccessToken({userId, sid: found.session.id})

    // matching on the old hash means two refreshes racing with the same token can't both win
    const [result] = await db.update(sessionsTable).set({
      refreshTokenHash: hashToken(newRefreshToken),
      expiresAt: getTokenExpiry(newRefreshToken),
      lastUsedAt: new Date(),
      ...describeClient(req),
    })
    .where(and(eq(sessionsTable.id, found.session.id), eq(sessionsTable.refreshTokenHash, hashedRefreshToken)))
    .returning({id: sessionsTable.id})

    if(!result) {
      throw ApiError.unauthorized("Invalid or expired refresh token")
    }

    setSessionCookies(res, {accessToken: newAccessToken, refreshToken: newRefreshToken})

    return ApiResponse.ok(res, 'Refresh token validated successfully', {id: userId})
  }

  public async handleForgotPassword(req: Request, res: Response) {
    const {email} = await parseOrThrow(forgotPasswordPayloadModel, req.body)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.email, email))

    // same response whether or not the user exists, so this endpoint can't be used to check which emails are registered
    const genericMessage = 'If an account with this email exists, a reset password email has been sent'

    if(!userInDb) {
      return ApiResponse.ok(res, genericMessage)
    }

    const {token: resetPasswordToken, hashedToken: hashedResetPasswordToken} = createTempToken()
    const resetPasswordTokenExpiry = new Date(Date.now() + RESET_LINK_MS)

    const [result] = await db.update(usersTable).set({resetPasswordToken: hashedResetPasswordToken, resetPasswordTokenExpiry}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

    if(!result) {
      throw ApiError.internal('Could not save reset password token in db')
    }

    const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetPasswordToken}`

    // send the reset password email without awaiting it, so a mail failure or the extra delay doesn't reveal that the user exists
    sendResetPasswordMail(userInDb.email, userInDb.firstName, resetUrl).catch((error) => {
      console.error(`Failed to send reset password mail to ${userInDb.email}:`, error)
    })

    return ApiResponse.ok(res, genericMessage)
  }

  public async handleResetPassword(req: Request, res: Response) {
    // the token from the url, the new password from the body
    const {token: resetPasswordToken, newPassword} = await parseOrThrow(resetPasswordPayloadModel, {token: req.params.token, ...req.body})

    const hashedToken = hashToken(resetPasswordToken)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.resetPasswordToken, hashedToken))

    const isTokenValid = userInDb && userInDb.resetPasswordTokenExpiry && userInDb.resetPasswordTokenExpiry > new Date()

    if(!userInDb || !isTokenValid) {
      throw ApiError.notFound('Invalid or expired reset password token')
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)

    // if valid, update the password, remove the reset token fields, and end every session, so every device is signed out.
    // the link was opened from the inbox, which proves the email just as verification does, so it also verifies the account:
    // that is how an invited user (no password yet, see admin invites) finishes setting up. any pending verification link is
    // cancelled with it, and admin sudo mode ends with the sessions it was stored on. matching on the token means two uses of
    // the same link can't both succeed
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(usersTable).set({
        password: hashedNewPassword,
        resetPasswordToken: null,
        resetPasswordTokenExpiry: null,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiry: null,
      }).where(and(eq(usersTable.id, userInDb.id), eq(usersTable.resetPasswordToken, hashedToken))).returning({id: usersTable.id})

      if(updated) {
        await tx.delete(sessionsTable).where(eq(sessionsTable.userId, updated.id))
      }
      return updated
    })

    // no row means the link was used in the meantime
    if(!result) {
      throw ApiError.notFound('Invalid or expired reset password token')
    }

    return ApiResponse.ok(res, 'Password reset successfully', {id: result.id})
  }

  public async handleChangePassword(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    const {currentPassword, newPassword} = await parseOrThrow(changePasswordPayloadModel, req.body)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.id, userId))

    if(!userInDb || !userInDb.password) {
      throw ApiError.unauthorized('User not found')
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, userInDb.password)

    if(!isPasswordValid) {
      throw ApiError.badRequest('Current password is incorrect')
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)

    // end every session, then start a fresh one here, so other devices are signed out while this one stays signed in.
    // a fresh session also ends sudo mode, since the password it confirmed has changed
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(usersTable).set({password: hashedNewPassword}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

      if(!updated) {
        throw ApiError.internal('Could not update password in db')
      }

      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, updated.id))
      return {id: updated.id, tokens: await startSession(tx, updated.id, req)}
    })

    setSessionCookies(res, result.tokens)

    return ApiResponse.ok(res, 'Password changed successfully', {id: result.id})
  }

  public async handleUploadAvatar(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    // the file is already parsed and its type checked by the uploadAvatar middleware
    const file = req.file
    const extension: string | undefined = res.locals.imageExtension

    if(!file || !extension) {
      throw ApiError.badRequest('Avatar file is required')
    }

    // upload to ImageKit first; the old avatar stays in place until the db points at the new one
    // the file name is random so the public url doesn't expose the user's id; the tag still links the file to its user in the ImageKit dashboard
    const uploadedAvatar = await uploadImage(file.buffer, `${crypto.randomUUID()}.${extension}`, file.mimetype, '/avatars', [`user:${userId}`])

    // lock the row so two uploads at the same time can't both read the same old avatar and leave one file orphaned
    let previousAvatarFileId: string | null
    try {
      previousAvatarFileId = await db.transaction(async (tx) => {
        const [userInDb] = await tx.select({avatarFileId: usersTable.avatarFileId}).from(usersTable).where(eq(usersTable.id, userId)).for('update')

        if(!userInDb) {
          throw ApiError.unauthorized('User not found')
        }

        await tx.update(usersTable).set({avatarUrl: uploadedAvatar.url, avatarFileId: uploadedAvatar.fileId}).where(eq(usersTable.id, userId))

        return userInDb.avatarFileId
      })
    } catch (error) {
      // the db was not updated, so remove the file we just uploaded instead of leaving it unused in ImageKit
      deleteImage(uploadedAvatar.fileId).catch((deleteError) => {
        console.error(`Failed to delete unused avatar ${uploadedAvatar.fileId} from ImageKit:`, deleteError)
      })
      throw error
    }

    // the new avatar is saved, so a failure to delete the old one shouldn't fail the upload
    if(previousAvatarFileId) {
      deleteImage(previousAvatarFileId).catch((error) => {
        console.error(`Failed to delete old avatar ${previousAvatarFileId} from ImageKit:`, error)
      })
    }

    return ApiResponse.ok(res, 'Avatar uploaded successfully', {avatarUrl: uploadedAvatar.url})
  }

  public async handleDeleteAvatar(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    // lock the row, like upload does, so a removal racing an upload can't leave a file nobody points at
    const previousAvatarFileId = await db.transaction(async (tx) => {
      const [userInDb] = await tx.select({avatarFileId: usersTable.avatarFileId}).from(usersTable).where(eq(usersTable.id, userId)).for('update')

      if(!userInDb) {
        throw ApiError.unauthorized('User not found')
      }

      await tx.update(usersTable).set({avatarUrl: null, avatarFileId: null}).where(eq(usersTable.id, userId))

      return userInDb.avatarFileId
    })

    // the db no longer points at the file, so a failed delete leaves only an unused file, never a broken avatar
    if(previousAvatarFileId) {
      deleteImage(previousAvatarFileId).catch((error) => {
        console.error(`Failed to delete removed avatar ${previousAvatarFileId} from ImageKit:`, error)
      })
    }

    // removing an avatar that's already gone is still a success, so a double click or a retry isn't an error
    return ApiResponse.ok(res, 'Avatar removed successfully', {avatarUrl: null})
  }

  public async handleUpdateProfile(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    // only the fields that were sent change; an empty last name means "remove it", like null
    const {firstName, lastName, age} = await parseOrThrow(updateProfilePayloadModel, req.body)
    const changes = {
      ...(firstName !== undefined && {firstName}),
      ...(lastName !== undefined && {lastName: lastName || null}),
      ...(age !== undefined && {age}),
    }

    const [updatedUser] = await db.update(usersTable).set(changes).where(eq(usersTable.id, userId)).returning(safeUserColumns)

    if(!updatedUser) {
      throw ApiError.internal('Could not update profile in db')
    }

    return ApiResponse.ok(res, 'Profile updated successfully', updatedUser)
  }

  public async handleDeleteAccount(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    const {password} = await parseOrThrow(deleteAccountPayloadModel, req.body)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.id, userId))

    if(!userInDb || !userInDb.password) {
      throw ApiError.unauthorized('User not found')
    }

    // admins are only removed on the server (src/scripts/manage-users.ts), so a stolen admin session can't take the admin away
    if(userInDb.role === userRolesEnum.ADMIN) {
      throw ApiError.forbidden('Admin accounts can only be deleted on the server')
    }

    // 400, not 401: the session is fine, and a 401 would make the frontend try a refresh
    const isPasswordValid = await bcrypt.compare(password, userInDb.password)

    if(!isPasswordValid) {
      throw ApiError.badRequest('Password is incorrect')
    }

    // the role check is part of the delete, so a promotion between the read above and this write can't slip through.
    // deleting the row deletes every session with it, so every device is signed out at once
    const [deletedUser] = await db.delete(usersTable)
      .where(and(eq(usersTable.id, userId), ne(usersTable.role, userRolesEnum.ADMIN)))
      .returning({id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, avatarFileId: usersTable.avatarFileId})

    if(!deletedUser) {
      throw ApiError.forbidden('Admin accounts can only be deleted on the server')
    }

    // the sessions went with the row (on delete cascade); the cookies go too
    clearSessionCookies(res)

    // the account is already gone, so a failure to remove the photo or send the mail shouldn't fail the request
    if(deletedUser.avatarFileId) {
      deleteImage(deletedUser.avatarFileId).catch((error) => {
        console.error(`Failed to delete avatar ${deletedUser.avatarFileId} from ImageKit:`, error)
      })
    }

    // authenticateToken only lets verified users through, so this address is known to be theirs
    sendAccountDeletedMail(deletedUser.email, deletedUser.firstName, `${getFrontendUrl()}/privacy`, 'user').catch((error) => {
      console.error(`Failed to send account deleted mail to ${deletedUser.email}:`, error)
    })

    return ApiResponse.ok(res, 'Account deleted successfully', {id: deletedUser.id})
  }

  public async handleChangeEmail(req: Request, res: Response) {
    const userId = (req.user as any)?.id

    const {newEmail, password} = await parseOrThrow(changeEmailPayloadModel, req.body)

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.id, userId))

    if(!userInDb || !userInDb.password) {
      throw ApiError.unauthorized('User not found')
    }

    // 400, not 401: the session is fine, and a 401 would make the frontend try a refresh
    const isPasswordValid = await bcrypt.compare(password, userInDb.password)

    if(!isPasswordValid) {
      throw ApiError.badRequest('Password is incorrect')
    }

    if(newEmail === userInDb.email) {
      throw ApiError.badRequest('That is already your email')
    }

    // the same answer whether or not the new address has an account, so this can't be used to check who's registered;
    // an address that's taken gets a notice instead of a link, and the unique constraint is checked again on confirm
    const genericMessage = `Check ${newEmail} for a link to confirm it`

    const [taken] = await db.select({id: usersTable.id}).from(usersTable).where(eq(usersTable.email, newEmail))

    if(taken) {
      sendEmailTakenMail(newEmail).catch((error) => {
        console.error(`Failed to send email taken mail to ${newEmail}:`, error)
      })
      return ApiResponse.ok(res, genericMessage)
    }

    // a new request replaces any earlier one, so only the latest link works
    const {token, hashedToken} = createTempToken()
    const [saved] = await db.update(usersTable).set({
      pendingEmail: newEmail,
      emailChangeToken: hashedToken,
      emailChangeTokenExpiry: new Date(Date.now() + EMAIL_CHANGE_LINK_MS),
    }).where(eq(usersTable.id, userId)).returning({id: usersTable.id})

    if(!saved) {
      throw ApiError.internal('Could not save email change in db')
    }

    sendConfirmEmailChangeMail(newEmail, userInDb.firstName, `${getFrontendUrl()}/confirm-email?token=${token}`, EMAIL_CHANGE_LINK_MS / 60_000).catch((error) => {
      console.error(`Failed to send confirm email change mail to ${newEmail}:`, error)
    })
    // the current address hears about it at once, before anything can change
    sendEmailChangeRequestedMail(userInDb.email, userInDb.firstName, newEmail, `${getFrontendUrl()}/forgot-password`).catch((error) => {
      console.error(`Failed to send email change requested mail to ${userInDb.email}:`, error)
    })

    return ApiResponse.ok(res, genericMessage)
  }

  public async handleConfirmEmailChange(req: Request, res: Response) {
    // no auth: the link may be opened on another device, and the token itself identifies the user
    const {token} = await parseOrThrow(confirmEmailChangePayloadModel, {token: req.params.token})
    const hashedToken = hashToken(token)

    const [userInDb] = await db.select({id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, pendingEmail: usersTable.pendingEmail})
      .from(usersTable)
      .where(and(eq(usersTable.emailChangeToken, hashedToken), gt(usersTable.emailChangeTokenExpiry, new Date())))

    if(!userInDb || !userInDb.pendingEmail) {
      throw ApiError.notFound('Invalid or expired email change link')
    }

    // matching on the token makes the link single-use even when opened twice at once. the unique constraint on email
    // decides the race with someone signing up with the same address in the meantime. a reset link still in the old
    // inbox is cancelled: people often move because they lost that inbox, and its link would hand the account back
    let updated: {id: string} | undefined
    try {
      [updated] = await db.update(usersTable).set({
        email: userInDb.pendingEmail,
        pendingEmail: null,
        emailChangeToken: null,
        emailChangeTokenExpiry: null,
        resetPasswordToken: null,
        resetPasswordTokenExpiry: null,
      })
      .where(and(eq(usersTable.id, userInDb.id), eq(usersTable.emailChangeToken, hashedToken)))
      .returning({id: usersTable.id})
    } catch (error) {
      if((error as {cause?: {code?: string}})?.cause?.code === '23505') {
        await db.update(usersTable).set({pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null}).where(eq(usersTable.id, userInDb.id))
        throw ApiError.conflict('That email now belongs to another account, so it could not be used')
      }
      throw error
    }

    if(!updated) {
      throw ApiError.notFound('Invalid or expired email change link')
    }

    sendEmailChangedMail(userInDb.email, userInDb.firstName, userInDb.pendingEmail, `${getFrontendUrl()}/privacy`).catch((error) => {
      console.error(`Failed to send email changed mail to ${userInDb.email}:`, error)
    })

    return ApiResponse.ok(res, 'Email changed successfully', {email: userInDb.pendingEmail})
  }

  public async handleResendVerification(req: Request, res: Response) {
    const {email} = await parseOrThrow(resendVerificationPayloadModel, req.body)

    // same response for no account, a verified one and an unverified one, so this can't be used to check who signed up
    const genericMessage = 'If this email is waiting to be confirmed, a new link has been sent'

    const {token: emailVerificationToken, hashedToken: hashedEmailVerificationToken} = createTempToken()
    const emailVerificationTokenExpiry = new Date(Date.now() + VERIFICATION_LINK_MS)

    // a cooldown with no new column: every link lives VERIFICATION_LINK_MS, so its expiry says when it was sent. a link sent
    // under RESEND_COOLDOWN_MS ago is left alone (and no mail goes out), which stops the button from flooding the inbox
    // while it still works within a minute, when people actually press it. a null expiry is a link cancelled by a wrong password
    const sentBefore = new Date(Date.now() + VERIFICATION_LINK_MS - RESEND_COOLDOWN_MS)
    const canReplaceLink = or(isNull(usersTable.emailVerificationTokenExpiry), lt(usersTable.emailVerificationTokenExpiry, sentBefore))

    // one conditional update decides everything, so two resends at once can't both send a mail.
    // invited users have no password yet and finish through their reset link, so a verification link (which asks for
    // the password) would be no use to them
    const [linkRenewed] = await db.update(usersTable).set({emailVerificationToken: hashedEmailVerificationToken, emailVerificationTokenExpiry})
    .where(and(
      eq(usersTable.email, email),
      eq(usersTable.emailVerified, false),
      isNotNull(usersTable.password),
      canReplaceLink,
    ))
    .returning({id: usersTable.id})

    if(linkRenewed) {
      sendEmailVerificationMail(email, verificationUrl(emailVerificationToken)).catch((error) => {
        console.error(`Failed to send verification mail to ${email}:`, error)
      })
    }

    return ApiResponse.ok(res, genericMessage)
  }

}
