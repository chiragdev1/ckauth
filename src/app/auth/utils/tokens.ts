import crypto from 'crypto'

// sha-256, not bcrypt: these tokens are long and random, so there's nothing to guess and a fast hash is enough
export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// a random token for an email link: the raw one goes in the link, only its hash is stored
export function createTempToken() {
  const token = crypto.randomBytes(32).toString('hex')
  return {token, hashedToken: hashToken(token)}
}
