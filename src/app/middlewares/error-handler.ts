import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../../utils/api-error.js';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if(err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? {code: err.code} : {})
    })
  }
  console.error(err)
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  })

}