import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { NextFunction, Request, Response } from 'express'

import { errorHandler } from '../src/app/middlewares/error-handler.js'
import { ApiError } from '../src/utils/api-error.js'

// every error a handler throws ends up here (express 5 forwards rejected promises), so this decides what the client sees

// records what the handler sent, in place of a real express response
function fakeResponse() {
  const sent: {status?: number, body?: unknown} = {}
  const res: {err?: Error, status: (code: number) => unknown, json: (body: unknown) => unknown} = {
    status(code: number) { sent.status = code; return res },
    json(body: unknown) { sent.body = body; return res },
  }
  return {res: res as unknown as Response & {err?: Error}, sent}
}

const req = {} as Request
const next = (() => {}) as NextFunction

describe('errorHandler', () => {
  test('uses the status and message of an ApiError, and logs nothing extra for a 4xx', () => {
    const {res, sent} = fakeResponse()
    errorHandler(ApiError.conflict('A user with this email already exists'), req, res, next)

    assert.deepEqual(sent, {status: 409, body: {success: false, message: 'A user with this email already exists'}})
    assert.equal(res.err, undefined)
  })

  // the request logger writes res.err, stack included, on the request's own line
  test('turns any other error into a plain 500, without leaking its message, and hands it to the request log', () => {
    const {res, sent} = fakeResponse()
    const error = new Error('connection string postgres://secret@db')
    errorHandler(error, req, res, next)

    assert.deepEqual(sent, {status: 500, body: {success: false, message: 'Internal Server Error'}})
    assert.equal(res.err, error)
  })

  test('an ApiError of 500 or more is handed to the request log too', () => {
    const {res} = fakeResponse()
    const error = new ApiError(502, 'Failed to upload image')
    errorHandler(error, req, res, next)
    assert.equal(res.err, error)
  })

  test('a thrown non-error still reaches the log as an Error', () => {
    const {res} = fakeResponse()
    errorHandler('a string', req, res, next)
    assert.equal(res.err?.message, 'a string')
  })
})
