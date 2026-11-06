import express from 'express'
import cookieParser from 'cookie-parser'
import type {Express, Request, Response} from 'express'

import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { metricsRouter } from './metrics/routes.js';
import { devRouter } from './dev/routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestLogger } from './middlewares/request-logger.js';

export function createExpressApplication(): Express {
  const app = express()

  // in production caddy sits in front, so trust one proxy hop for req.ip and req.secure
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // first, so every request gets an id and a log line, including ones a later middleware rejects
  app.use(requestLogger)
  app.use(express.json({limit: '50kb'}))
  app.use(express.urlencoded({extended: true}))
  app.use(cookieParser())
  
  app.use('/auth', authRouter)
  app.use('/admin', adminRouter)
  app.use('/metrics', metricsRouter)
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