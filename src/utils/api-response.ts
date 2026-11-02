import type {Response} from 'express';

export class ApiResponse {
  static ok(res:Response, message: string = "ok", data: unknown = null) {
    return res.status(200).json({
      success: true,
      message,
      data
    })
  }

  static created(res: Response, message: string = "created successfully", data: unknown = null) {
    return res.status(201).json({
      success: true,
      message,
      data
    })
  }
}