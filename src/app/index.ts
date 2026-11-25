import express from 'express'
import cookieParser from 'cookie-parser'
import type {Express, Request, Response} from 'express'

import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { metricsRouter } from './metrics/routes.js';
import { devRouter } from './dev/routes.js';
import { wellKnownRouter } from './oidc/routes.js';
import { isOidcEnabled } from './oidc/enabled.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestLogger } from './middlewares/request-logger.js';
import { refuseCrossSite } from './middlewares/refuse-cross-site.js';
import { getFrontendUrl } from './auth/utils/constants.js';

export function createExpressApplication(): Express {
  // email links, the cross-site check and the oidc issuer are all built from it. a value without http(s)://
  // (`ckauth.chiragdev.com`) would otherwise be a 500 on every write and on discovery, so refuse to start instead
  const frontendUrl = URL.parse(getFrontendUrl())
  if(!frontendUrl || !['http:', 'https:'].includes(frontendUrl.protocol)) {
    throw new Error('FRONTEND_URL must be an absolute http(s) url, such as https://ckauth.chiragdev.com')
  }

  const app = express()

  // in production caddy sits in front, so trust one proxy hop for req.ip and req.secure
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // first, so every request gets an id and a log line, including ones a later middleware rejects
  app.use(requestLogger)
  // json only: no endpoint takes a form body, and a form is the one body another site can post without a cors preflight.
  // /oauth/token needs form bodies (rfc 6749) and will parse them on its own router
  app.use(express.json({limit: '50kb'}))
  app.use(cookieParser())

  // the cookie-authenticated areas take writes from the web app's own origin only (see refuse-cross-site.ts)
  app.use('/auth', refuseCrossSite, authRouter)
  app.use('/admin', refuseCrossSite, adminRouter)
  app.use('/metrics', refuseCrossSite, metricsRouter)
  // sign in with ckauth (docs/OIDC.md), behind OIDC_ENABLED until the beta launches. unmounted rather than answering 503,
  // so a switched-off server looks like one that never had the feature. also not public yet: deploy/ckauth.caddy
  // doesn't route /.well-known to the api
  if(isOidcEnabled()) {
    app.use('/.well-known', wellKnownRouter)
  }
  // email previews for the dev-only /dev/emails page; never mounted in production (see dev/routes.ts)
  if(process.env.NODE_ENV !== 'production') {
    app.use('/dev', devRouter)
  }

  app.get("/", (req: Request, res: Response)=> {
    return res.status(200).json({
      message: "Express Application is running"
    })
  })
  
  app.use(errorHandler)
  return app
}