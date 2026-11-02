import { test } from 'node:test'

// CLAUDE.md "Known gaps", kept visible in every test run. turn a todo into a real test when its gap is fixed
test.todo('malformed JSON in a request body is a 400, not a 500 (errorHandler only knows ApiError)')
test.todo('a JSON body over 50 KB is a 413, not a 500')
test.todo('an access token stops working as soon as its session ends (today it lasts until it expires, up to 15 minutes)')
test.todo('signing in on a second device keeps the first one signed in (one refresh token per user today)')
test.todo('admin actions are recorded in a log (the logs feature)')
