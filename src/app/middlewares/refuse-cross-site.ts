import type { NextFunction, Request, Response } from 'express'

import { ApiError } from '../../utils/api-error.js'
import { getFrontendUrl } from '../auth/utils/constants.js'

// samesite=lax only stops other *sites*. every *.chiragdev.com host on the shared vps is the same site as ckauth, so a
// page on any of them could post to the api with the user's cookie attached. the web app and the api share one origin
// (caddy proxies /api), so a browser request that changes something always comes from that origin; anything else is
// refused. fetch metadata (sec-fetch-site) first, origin as the fallback for browsers without it. requests with neither
// header aren't from a browser (curl, server-to-server) and carry no ambient cookie a page could abuse, so they pass.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function refuseCrossSite(req: Request, res: Response, next: NextFunction) {
  if(SAFE_METHODS.has(req.method)) {
    return next()
  }
  const fetchSite = req.get('sec-fetch-site')
  const origin = req.get('origin')
  // 'same-site' is exactly the sibling-subdomain case, and 'none' (typed or bookmarked) can't send a post
  if(fetchSite !== undefined ? fetchSite !== 'same-origin' : origin !== undefined && origin !== new URL(getFrontendUrl()).origin) {
    throw ApiError.forbidden('Cross-site request refused')
  }
  return next()
}
