import express from 'express'
import type {Request, Response, Router} from 'express'
import { z } from 'zod'

import { emails, type Email } from '../../utils/emails.js'
import { DEFAULT_EMAIL_THEME, emailThemes, renderEmailHtml } from '../../utils/email-layout.js'
import { ApiError } from '../../utils/api-error.js'
import { ApiResponse } from '../../utils/api-response.js'
import { getFrontendUrl } from '../auth/utils/constants.js'
import { outbox } from '../../utils/mail.js'

// development only: src/app/index.ts mounts this router only when NODE_ENV isn't production, and the dockerfile and
// compose.yml both set production, so none of it exists on the live site. it renders every email with sample values for
// the /dev/emails page, which compares the email colour themes side by side
export const devRouter: Router = express.Router()

const site = getFrontendUrl()
const link = (path: string) => `${site}${path}?token=${'0'.repeat(64)}`

const samples: Record<string, () => Email> = {
  'verification': () => emails.verification(link('/verify-email')),
  'welcome': () => emails.welcome('Ada'),
  'reset-password': () => emails.resetPassword('Ada', link('/reset-password')),
  'account-exists': () => emails.accountExists('Ada', `${site}/sign-in`, `${site}/forgot-password`),
  'invite': () => emails.invite('Ada', `${link('/reset-password')}&invite=1`, 72),
  'account-deleted': () => emails.accountDeleted('Ada', `${site}/privacy`, 'user'),
  'new-sign-in': () => emails.newSignIn('Ada', 'Chrome on Windows', '203.0.113.7', `${site}/dashboard#devices`, `${site}/forgot-password`),
  'confirm-email-change': () => emails.confirmEmailChange('Ada', link('/confirm-email'), 60),
  'email-change-requested': () => emails.emailChangeRequested('Ada', 'ada@newmail.example', `${site}/forgot-password`),
  'email-changed': () => emails.emailChanged('Ada', 'ada@newmail.example', `${site}/privacy`),
  'email-taken': () => emails.emailTaken(),
}

const previewQueryModel = z.object({
  theme: z.enum(emailThemes).default(DEFAULT_EMAIL_THEME),
})

devRouter.get('/emails', (req: Request, res: Response) => {
  return ApiResponse.ok(res, 'Email previews', {
    themes: emailThemes,
    emails: Object.entries(samples).map(([id, sample]) => ({id, subject: sample().subject})),
  })
})

devRouter.get('/emails/:id', (req: Request, res: Response) => {
  const sample = samples[String(req.params.id)]
  const query = previewQueryModel.safeParse(req.query)
  if(!sample || !query.success) {
    throw ApiError.notFound('No such email or theme')
  }
  // the page shows it in an iframe; html, not the usual json envelope
  return res.type('html').send(renderEmailHtml(sample().content, query.data.theme))
})

const outboxQueryModel = z.object({to: z.string().min(1)})

// the browser tests (e2e/) run the API in another process, so they can't read `outbox` directly: this is their inbox.
// only with MAIL_TRANSPORT=memory, the one setup where the outbox fills, so a dev server that sends real mail exposes nothing
devRouter.get('/outbox', (req: Request, res: Response) => {
  const query = outboxQueryModel.safeParse(req.query)
  const mail = process.env.MAIL_TRANSPORT === 'memory' && query.success
    ? outbox.findLast(mail => mail.to === query.data.to)
    : undefined
  if(!mail) {
    throw ApiError.notFound('No mail to that address')
  }
  return ApiResponse.ok(res, 'Latest mail', {to: mail.to, subject: mail.subject, text: mail.text})
})
