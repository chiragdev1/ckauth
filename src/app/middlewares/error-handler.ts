import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../utils/api-error.js';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // the request logger writes res.err (stack included) on the request's own line, so a fault is one line, not two
  if(!(err instanceof ApiError) || err.statusCode >= 500) {
    res.err = err instanceof Error ? err : new Error(String(err))
  }
  if(err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? {code: err.code} : {})
    })
  }
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  })

}
