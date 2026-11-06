import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { Request } from 'express'
import type { LevelWithSilent } from 'pino'
import { pinoHttp } from 'pino-http'

import { logger } from '../../utils/logger.js'

// tokens travel in some paths (/auth/verify-email/:token), so a request is logged by its route template, never its url;
// the query string is dropped too (/admin/users?search= holds what an admin typed). a request no route matched
// (a 404, or a 401 from the admin router's guard) has no template, so its path is logged with long segments masked
export function routeOf(req: Request) {
  const path = (req.originalUrl.split('?')[0] ?? '').replace(/\/+$/, '')
  if(req.route) {
    // not req.baseUrl: express resets it to '' once a thrown error leaves the router, which is exactly when the line
    // matters. the mount prefix is whatever comes before the template's own segments, never a token
    const segments = path.split('/')
    const prefix = segments.slice(0, segments.length - req.route.path.split('/').length + 1).join('/')
    return `${prefix}${req.route.path}`
  }
  return path.replace(/[^/]{32,}/g, ':redacted').slice(0, 200) || '/'
}

// the fields of the one line written per request, built when the response finishes, once routing and
// authenticateToken have run. an allow-list: pino-http's default serializer would log every header, cookies included
export function requestFields(req: Request, res: ServerResponse, responseTime: number) {
  return {
    method: req.method,
    route: routeOf(req),
    status: res.statusCode,
    ms: responseTime,
    ip: req.ip,
    userId: (req.user as any)?.id,
  }
}

// production runs at info, so 'debug' keeps a line out of production logs while LOG_LEVEL=debug still shows it locally
export function logLevelFor(req: Request, res: ServerResponse, err?: Error): LevelWithSilent {
  // the connection broke or the server failed: someone has to look
  if(err || res.statusCode >= 500) {
    return 'error'
  }
  const route = routeOf(req)
  // a rate limit means someone is retrying hard, and a refused /admin request means someone is probing it, which is
  // what an attack looks like. other 403s are ordinary (an unverified sign-in, the sudo-mode prompt)
  if(res.statusCode === 429 || (res.statusCode === 403 && route.startsWith('/admin'))) {
    return 'warn'
  }
  // every anonymous visit asks /auth/me and then /auth/refresh and gets a 401 from both (a known gap in CLAUDE.md);
  // expected, and at info they'd be most of the log
  if(res.statusCode === 401 && (route === '/auth/me' || route === '/auth/refresh')) {
    return 'debug'
  }
  return 'info'
}

export const requestLogger = pinoHttp({
  logger,
  // returned as X-Request-Id, so a user reporting a problem can quote the id that finds their request's lines
  genReqId: (_req, res) => {
    const id = randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
  },
  customAttributeKeys: {reqId: 'reqId'},
  // req.log and the finished line carry only reqId; requestFields adds the rest at the end
  quietReqLogger: true,
  quietResLogger: true,
  customLogLevel: (req, res, err) => logLevelFor(req as Request, res, err),
  customSuccessObject: (req, res, value) => requestFields(req as Request, res, value.responseTime),
  customErrorObject: (req, res, err, value) => ({...requestFields(req as Request, res, value.responseTime), err}),
})
