import express from 'express'
import type {Router} from 'express'
import { OidcController } from './controller.js'

// mounted at /.well-known: their paths are fixed by the standards, so they sit outside /auth.
// no auth and no rate limit: both are public, cacheable and read nothing from the database
export const wellKnownRouter: Router = express.Router()

const oidcController = new OidcController()

wellKnownRouter.get('/openid-configuration', oidcController.handleDiscovery.bind(oidcController))
wellKnownRouter.get('/jwks.json', oidcController.handleJwks.bind(oidcController))
