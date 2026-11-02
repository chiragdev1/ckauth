import express from 'express'
import cookieParser from 'cookie-parser'
import type {Express, Request, Response} from 'express'

import { authRouter } from './auth/routes.js';
import { adminRouter } from './admin/routes.js';
import { errorHandler } from './middlewares/error-handler.js';

export function createExpressApplication(): Express {
  const app = express()

  // in production caddy sits in front, so trust one proxy hop for req.ip and req.secure
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // middlewares
  app.use(express.json({limit: '50kb'}))
  app.use(express.urlencoded({extended: true}))
  app.use(express.static('public'))
  app.use(cookieParser())
  
  app.use('/auth', authRouter)
  app.use('/admin', adminRouter)
  
  // routes
  app.get("/", (req: Request, res: Response)=> {
    return res.status(200).json({
      message: "Express Application is running"
    })
  })
  
  app.use(errorHandler)
  return app
}