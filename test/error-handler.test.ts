import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import type { NextFunction, Request, Response } from 'express'

import { errorHandler } from '../src/app/middlewares/error-handler.js'
import { ApiError } from '../src/utils/api-error.js'

// every error a handler throws ends up here (express 5 forwards rejected promises), so this decides what the client sees

// records what the handler sent, in place of a real express response
function fakeResponse() {
  const sent: {status?: number, body?: unknown} = {}
  const res = {
    status(code: number) { sent.status = code; return res },
    json(body: unknown) { sent.body = body; return res },
  }
  return {res: res as unknown as Response, sent}
}

const req = {} as Request
const next = (() => {}) as NextFunction

describe('errorHandler', () => {
  test('uses the status and message of an ApiError', () => {
    const {res, sent} = fakeResponse()
    errorHandler(ApiError.conflict('A user with this email already exists'), req, res, next)

    assert.deepEqual(sent, {status: 409, body: {success: false, message: 'A user with this email already exists'}})
  })

  test('turns any other error into a plain 500, without leaking its message, and logs it', () => {
    const {res, sent} = fakeResponse()
    const logged = mock.method(console, 'error', () => {})

    try {
      errorHandler(new Error('connection string postgres://secret@db'), req, res, next)
    } finally {
      logged.mock.restore()
    }

    assert.deepEqual(sent, {status: 500, body: {success: false, message: 'Internal Server Error'}})
    assert.equal(logged.mock.callCount(), 1)
  })
})
