import type {Response} from 'express'

export class ApiError extends Error {
  statusCode: number
  // a stable, machine-readable reason for the few errors a client must handle specially (e.g. REAUTH_REQUIRED);
  // messages are for people and may change
  code: string | undefined

  constructor(statusCode: number , message: string = "something went wrong", code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message: string = "Bad Request") {
    return new ApiError(400, message)
  }

  static unauthorized(message = "unauthorized"){
    return new ApiError(401, message)
  }

  static forbidden(message="Forbidden"){
    return new ApiError(403, message)
  }

  static notFound(message="Not Found"){
    return new ApiError(404, message)
  }

  static conflict(message="conflict"){
    return new ApiError(409, message)
  }

  static internal(message="Internal Server Error"){
    return new ApiError(500, message)
  }
}