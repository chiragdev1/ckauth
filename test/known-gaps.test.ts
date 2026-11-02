import { test } from 'node:test'

// CLAUDE.md "Known gaps", kept visible in every test run. turn a todo into a real test when its gap is fixed
test.todo('malformed JSON in a request body is a 400, not a 500 (errorHandler only knows ApiError)')
test.todo('a JSON body over 50 KB is a 413, not a 500')
