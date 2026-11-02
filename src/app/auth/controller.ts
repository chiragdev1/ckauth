import type {Request, Response} from 'express'
// native bcrypt hashes on libuv's thread pool, so password checks don't block other requests
import bcrypt from 'bcrypt'
import crypto from 'crypto'

import { changePasswordPayloadModel, forgotPasswordPayloadModel, resetPasswordPayloadModel, signinPayloadModel, signupPayloadModel, verifyEmailPayloadModel } from './models.js';
import { db } from '../../db/index.js';
import { usersTable } from '../../db/schema.js';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, getTokenExpiry, verifyRefreshToken } from './utils/jwt-token.js';
import { ApiError } from '../../utils/api-error.js';
import { ApiResponse } from '../../utils/api-response.js';
import { cookieOptions, getFrontendUrl, PASSWORD_HASH_ROUNDS } from './utils/constants.js';
import { sendAccountExistsMail, sendEmailVerificationMail, sendResetPasswordMail, sendWelcomeMail } from '../../utils/mail.js';
import { deleteImage, uploadImage } from '../../utils/imagekit.js';

// hash of a random value nobody knows, made once at startup; compared against when an email has no account
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), PASSWORD_HASH_ROUNDS)

export class AuthController {

  public async handleSignup(req: Request, res: Response) {

    // validate values from req.body
    const validationResult = await signupPayloadModel.safeParseAsync(req.body)

    // if validation failed throw badRequest error
    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {firstName, lastName, age, email, password} = validationResult.data

    // same response whether or not the email is already registered, so this endpoint can't be used to check which emails have accounts;
    // the difference is only explained in the mail, which only the owner of the email can read
    const genericMessage = 'Check your email to finish creating your account'

    // hash the password before checking the email, so both cases take about the same time
    const hash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS)

    const {token: emailVerificationToken, hashedToken: hashedEmailVerificationToken} = await createTempToken()
    const emailVerificationTokenExpiry = new Date(Date.now() + (15*60*1000)) // 15 minutes from now
    const verificationUrl = `${getFrontendUrl()}/verify-email?token=${emailVerificationToken}`

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
      sendEmailVerificationMail(email, verificationUrl).catch((error) => {
        console.error(`Failed to send verification mail to ${email}:`, error)
      })
      return ApiResponse.created(res, genericMessage)
    }

    // no row returned means the email is already registered
    const now = new Date()

    // not verified yet: whoever controls the inbox hasn't claimed it, so the latest signup replaces the details and gets a new link.
    // only once the last link has expired, so a signup can't swap the password under a link that is still in the owner's inbox.
    // clearing the refreshToken signs out anyone who signed in with the old password before verifying
    const [unverifiedUser] = await db.update(usersTable).set({
      firstName,
      lastName: lastName ?? null,
      age: age ?? null,
      password: hash,
      emailVerificationToken: hashedEmailVerificationToken,
      emailVerificationTokenExpiry,
      refreshToken: null
    })
    .where(and(
      eq(usersTable.email, email),
      eq(usersTable.emailVerified, false),
      or(isNull(usersTable.emailVerificationTokenExpiry), lt(usersTable.emailVerificationTokenExpiry, now))
    ))
    .returning({id: usersTable.id})

    if(unverifiedUser) {
      sendEmailVerificationMail(email, verificationUrl).catch((error) => {
        console.error(`Failed to send verification mail to ${email}:`, error)
      })
      return ApiResponse.created(res, genericMessage)
    }

    // verified: tell the owner someone tried to sign up with their email, at most once every 15 minutes so the inbox can't be flooded.
    // the check and the update are one query, so parallel signups can't both send the mail
    const accountExistsMailCooldown = new Date(now.getTime() - (15*60*1000))

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
    // validate input fields(email, password)
    const validationResult = await signinPayloadModel.safeParseAsync(req.body)

    // throw error if validation failed(400 badRequest)
    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {email, password} = validationResult.data

    // check if user with email exist in db
    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.email, email))
    // console.log('userInDb', userInDb)

    // still run a bcrypt compare when there is no account, otherwise the faster response would reveal that the email isn't registered
    if(!userInDb || !userInDb.password) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
      throw ApiError.unauthorized('Invalid email or password')
    }

    // compare the passwords
    const isPasswordValid = await bcrypt.compare(password, userInDb.password)

    // throw error if password do not match(email or password is invalid)
    if(!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password')
    }

    // no session until the email is verified, so nobody can get into an account before the inbox owner has claimed it
    if(!userInDb.emailVerified) {
      const {token: emailVerificationToken, hashedToken: hashedEmailVerificationToken} = await createTempToken()
      const emailVerificationTokenExpiry = new Date(Date.now() + (15*60*1000)) // 15 minutes from now

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
        const verificationUrl = `${getFrontendUrl()}/verify-email?token=${emailVerificationToken}`
        sendEmailVerificationMail(userInDb.email, verificationUrl).catch((error) => {
          console.error(`Failed to send verification mail to ${userInDb.email}:`, error)
        })
      }

      throw ApiError.forbidden('Please verify your email before signing in, check your inbox for the verification link')
    }

    // generate and assign tokens
    const accessToken = generateAccessToken({userId: userInDb.id})
    const refreshToken = generateRefreshToken({userId: userInDb.id})

    // hash the refreshToken before saving it in db
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex')

    // save the hashed refreshToken in db
    const [result] = await db.update(usersTable).set({refreshToken: hashedRefreshToken}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

    if(!result) {
      throw ApiError.internal('Could not save refresh token in db')
    }

    // save the tokens in cookies/response data object
    res.cookie('access_token', accessToken, {...cookieOptions, expires: getTokenExpiry(accessToken)})
    res.cookie('refresh_token', refreshToken, {...cookieOptions, expires: getTokenExpiry(refreshToken)})

    // send the response
    return ApiResponse.ok(res, 'User signed in successfully', {id: userInDb.id})
  }

  public async handleVerifyEmail(req: Request, res: Response) {

    // validate the token from req.params and the password from req.body
    const validationResult = await verifyEmailPayloadModel.safeParseAsync({token: req.params.token, ...req.body})

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {token, password} =  validationResult.data
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    // search the db for the user with the token and check if it is valid and not expired
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

    // the link and the password together prove both inbox and account, the same proof sign-in asks for, so verifying also starts a session
    const accessToken = generateAccessToken({userId: userInDb.id})
    const refreshToken = generateRefreshToken({userId: userInDb.id})
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex')

    // mark the email verified and remove the token; matching on the token means a signup that replaced the details in the meantime
    // (and so the password just checked) makes this update do nothing.
    // replacing the refreshToken signs out any session started before the email was verified, and saves the new one in the same write
    const [updateRes] = await db
      .update(usersTable)
      .set({emailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiry: null, refreshToken: hashedRefreshToken})
      .where(and(eq(usersTable.id, userInDb.id), eq(usersTable.emailVerificationToken, hashedToken)))
      .returning({id: usersTable.id})

    // no row returned means the token was used or replaced since it was read
    if(!updateRes) {
      throw ApiError.notFound('Invalid or expired email token')
    }

    // cookies only once the update succeeded, so a lost race never hands out a session
    res.cookie('access_token', accessToken, {...cookieOptions, expires: getTokenExpiry(accessToken)})
    res.cookie('refresh_token', refreshToken, {...cookieOptions, expires: getTokenExpiry(refreshToken)})

    // send welcome mail now that signup is complete; a mail failure shouldn't fail verification
    sendWelcomeMail(userInDb.email, userInDb.firstName).catch((error) => {
      console.error(`Failed to send welcome mail to ${userInDb.email}:`, error)
    })

    return ApiResponse.ok(res, 'Email verified successfully', {id: updateRes.id})
  }

  public async handleLogout(req: Request, res: Response) {
    // no auth middleware here, so logout still works after the access token has expired
    const refreshToken = req.cookies?.refresh_token

    // revoke the refreshToken in db; matching on the hash means only the owner of this token can revoke it
    if(refreshToken) {
      const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex')
      // also ends admin sudo mode, so a confirmed password doesn't outlive the session it was confirmed in
      await db.update(usersTable).set({refreshToken: null, reauthenticatedAt: null}).where(eq(usersTable.refreshToken, hashedRefreshToken))
    }

    // always clear both accessToken and refreshToken cookies
    res.clearCookie('access_token', cookieOptions)
    res.clearCookie('refresh_token', cookieOptions)

    // send response
    return ApiResponse.ok(res, 'User logged out successfully')
  }

  public async handleMe(req: Request, res: Response) {

    // the user is already authenticated via authenticate middleware
    const safeUser = req.user as any

    // send Response
    return ApiResponse.ok(res, 'User details fetched successfully', safeUser)
  }

  public async handleRefresh(req: Request, res: Response) {
    // get the tokens from the cookies
    const refreshToken = req.cookies?.refresh_token
    
    if(!refreshToken) {
      throw ApiError.unauthorized("Refresh token not provided")
    }

    // validate the refreshToken and extract the userId from it
    const {userId} = verifyRefreshToken(refreshToken)

    // hash the refreshToken before searching it in db
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex')

    // search the db for the hashed token
    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.refreshToken, hashedRefreshToken))

    // for double checking check if the userId from the token matches the userId from the db
    if(!userInDb || userInDb.id !== userId) {
      throw ApiError.unauthorized("Invalid or expired refresh token")
    }

    // sessions from before sign in required a verified email can't be renewed
    if(!userInDb.emailVerified) {
      throw ApiError.forbidden("Please verify your email before signing in")
    }

    // if refreshTOken match then generate new accessToken and refreshToken
    const newAccessToken = generateAccessToken({userId: userInDb.id})
    const newRefreshToken = generateRefreshToken({userId: userInDb.id})

    // hash the new refreshToken before saving it in db
    const newHashedRefreshToken = crypto.createHash('sha256').update(newRefreshToken).digest('hex')

    // save the new refreshToken in db
    const [result] = await db.update(usersTable).set({refreshToken: newHashedRefreshToken}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})
    
    // send error if the db update failed
    if(!result) {
      throw ApiError.internal("Could not update refresh token in db")
    }

    // set the tokens in cookies
    res.cookie('access_token', newAccessToken, {...cookieOptions, expires: getTokenExpiry(newAccessToken)})
    res.cookie('refresh_token', newRefreshToken, {...cookieOptions, expires: getTokenExpiry(newRefreshToken)})

    // send response
    return ApiResponse.ok(res, 'Refresh token validated successfully', {id: userInDb.id})
  }

  public async handleForgotPassword(req: Request, res: Response) {
    // validate the email in zod
    const validationResult = await forgotPasswordPayloadModel.safeParseAsync(req.body)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {email} = validationResult.data

    // search the db for email
    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.email, email))

    // same response whether or not the user exists, so this endpoint can't be used to check which emails are registered
    const genericMessage = 'If an account with this email exists, a reset password email has been sent'

    if(!userInDb) {
      return ApiResponse.ok(res, genericMessage)
    }

    // generate a resetPasswordToken and save it in db with expiry
    const {token: resetPasswordToken, hashedToken: hashedResetPasswordToken} = await createTempToken()
    const resetPasswordTokenExpiry = new Date(Date.now() + (15*60*1000)) // 15 minutes from now

    // sve the resetPasswordToken and resetPasswordTokenExpiry in db
    const [result] = await db.update(usersTable).set({resetPasswordToken: hashedResetPasswordToken, resetPasswordTokenExpiry}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

    // if no row returned, send 500 error
    if(!result) {
      throw ApiError.internal('Could not save reset password token in db')
    }

    // create the reset password url pointing at the frontend page
    const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetPasswordToken}`

    // send the reset password email without awaiting it, so a mail failure or the extra delay doesn't reveal that the user exists
    sendResetPasswordMail(userInDb.email, userInDb.firstName, resetUrl).catch((error) => {
      console.error(`Failed to send reset password mail to ${userInDb.email}:`, error)
    })

    // send response
    return ApiResponse.ok(res, genericMessage)
  }

  public async handleResetPassword(req: Request, res: Response) {
    // get the token from req.params
    const token = req.params.token

    // validate the token and newPassword in zod
    const validationResult = await resetPasswordPayloadModel.safeParseAsync({token, ...req.body})
    
    // if validation failed throw badRequest error
    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    // extract the token and newPassword from the validated data
    const {token: resetPasswordToken, newPassword} = validationResult.data

    // hash the token and search the db for the user with the hashed token
    const hashedToken = crypto.createHash('sha256').update(resetPasswordToken).digest('hex')

    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.resetPasswordToken, hashedToken))

    // if user not found or token expired, send 404 error
    const isTokenValid = userInDb && userInDb.resetPasswordTokenExpiry && userInDb.resetPasswordTokenExpiry > new Date()

    if(!userInDb || !isTokenValid) {
      throw ApiError.notFound('Invalid or expired reset password token')
    }

    // hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)

    // if valid, update the password, remove the reset token fields, and clear the refreshToken so existing sessions are signed out.
    // the link was opened from the inbox, which proves the email just as verification does, so it also verifies the account:
    // that is how an invited user (no password yet, see admin invites) finishes setting up. any pending verification link is
    // cancelled with it, and admin sudo mode ends, since the password it confirmed has changed
    const [result] = await db.update(usersTable).set({
      password: hashedNewPassword,
      resetPasswordToken: null,
      resetPasswordTokenExpiry: null,
      refreshToken: null,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      reauthenticatedAt: null,
    }).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

    // if no row returned, send 500 error
    if(!result) {
      throw ApiError.internal('Could not update password in db')
    }

    // send response
    return ApiResponse.ok(res, 'Password reset successfully', {id: result?.id})
  }

  public async handleChangePassword(req: Request, res: Response) {
    // get the id from req.user
    const userId = (req.user as any)?.id

    // validate the currentPassword and newPassword in zod
    const validationResult = await changePasswordPayloadModel.safeParseAsync(req.body)

    if(!validationResult.success) {
      throw ApiError.badRequest(`Invalid input fields: ${validationResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`)
    }

    const {currentPassword, newPassword} = validationResult.data

    // search the db for user with id
    const [userInDb] = await db.select().from(usersTable).where(eq(usersTable.id, userId))

    if(!userInDb || !userInDb.password) {
      throw ApiError.unauthorized('User not found')
    }

    // compare the currentPassword with the password in db
    const isPasswordValid = await bcrypt.compare(currentPassword, userInDb.password)

    if(!isPasswordValid) {
      throw ApiError.badRequest('Current password is incorrect')
    }

    // hash the newPassword
    const hashedNewPassword = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)

    // rotate the refreshToken so sessions on other devices are signed out, while this one stays signed in
    const accessToken = generateAccessToken({userId: userInDb.id})
    const refreshToken = generateRefreshToken({userId: userInDb.id})
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex')

    // update the password and refreshToken in db
    const [result] = await db.update(usersTable).set({password: hashedNewPassword, refreshToken: hashedRefreshToken}).where(eq(usersTable.id, userInDb.id)).returning({id: usersTable.id})

    if(!result) {
      throw ApiError.internal('Could not update password in db')
    }

    // set the new tokens in cookies
    res.cookie('access_token', accessToken, {...cookieOptions, expires: getTokenExpiry(accessToken)})
    res.cookie('refresh_token', refreshToken, {...cookieOptions, expires: getTokenExpiry(refreshToken)})

    // send response
    return ApiResponse.ok(res, 'Password changed successfully', {id: result.id})
  }

  public async handleUploadAvatar(req: Request, res: Response) {
    // get the id from req.user
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

    // send response
    return ApiResponse.ok(res, 'Avatar uploaded successfully', {avatarUrl: uploadedAvatar.url})
  }

}

export async function createTempToken() {
  
  const token = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

  return {token, hashedToken}
}