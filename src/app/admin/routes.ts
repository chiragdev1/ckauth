import express from 'express'
import type {Router} from 'express'
import { AdminController } from './controller.js';
import { authenticateToken, authorizeRoles } from '../auth/middleware.js';
import { requireRecentReauth } from './middleware.js';
import { rateLimits } from '../middlewares/rate-limit.js';
import { userRolesEnum } from '../auth/utils/constants.js';

export const adminRouter: Router = express.Router()

const adminController = new AdminController()

// every admin route needs a signed in, verified admin; router.use runs these before any route below
adminRouter.use(authenticateToken, authorizeRoles(userRolesEnum.ADMIN))

adminRouter.get('/stats', adminController.handleStats.bind(adminController))
adminRouter.get('/users', adminController.handleListUsers.bind(adminController))

// checks a password, so it gets the same failures-only limit as sign-in
adminRouter.post('/reauth', rateLimits.adminReauthPerUser, adminController.handleReauth.bind(adminController))

// writes: rate limited, then only within a few minutes of confirming the password (sudo mode)
adminRouter.post('/users', rateLimits.adminWritePerUser, requireRecentReauth, adminController.handleInviteUser.bind(adminController))
adminRouter.delete('/users/:id', rateLimits.adminWritePerUser, requireRecentReauth, adminController.handleDeleteUser.bind(adminController))
