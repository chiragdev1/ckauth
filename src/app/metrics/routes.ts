import express from 'express'
import type {Router} from 'express'
import { MetricsController } from './controller.js';
import { rateLimits } from '../middlewares/rate-limit.js';

export const metricsRouter: Router = express.Router()

const metricsController = new MetricsController()

// no auth: visitors arriving from a tweet aren't signed in. limited per ip so one script can't inflate the counts
metricsRouter.post('/visit', rateLimits.metricsVisitPerIp, metricsController.handleVisit.bind(metricsController))
