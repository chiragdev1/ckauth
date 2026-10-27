// the meter is advisory: validateNewPassword() in validation.ts is the hard gate, this tells people how far past it they are
export type StrengthScore = 0 | 1 | 2 | 3 | 4

export const strengthLevels: Record<StrengthScore, { label: string, tone: string }> = {
  0: { label: 'Breached', tone: 'bg-destructive' },
  1: { label: 'Weak', tone: 'bg-destructive' },
  2: { label: 'Holding', tone: 'bg-brass' },
  3: { label: 'Strong', tone: 'bg-success' },
  4: { label: 'Fortified', tone: 'bg-success' },
}

// the passwords attackers try first (top of every leaked list); lowercase, compared after stripping digits and symbols
const COMMON = new Set([
  'password', 'passw', 'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn', 'abc', 'abcdef', 'letmein', 'welcome', 'admin', 'login',
  'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'cricket', 'india', 'master', 'secret', 'shadow',
])

// a shape, not a score: zxcvbn would be more accurate, but it adds ~400 KiB to a page that only needs a hint
export function scorePassword(password: string): StrengthScore {
  if(!password) return 0
  const letters = password.toLowerCase().replace(/[^a-z]/g, '')
  // one repeated character, a straight run (abcd, 1234) or a known leaked word: an attacker's first guesses
  if(/^(.)\1*$/.test(password) || isSequence(password.toLowerCase()) || COMMON.has(letters)) return 0

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter(pattern => pattern.test(password)).length
  // length counts most: each extra character multiplies the guesses, while a symbol only widens the alphabet a little
  let points = password.length >= 20 ? 4 : password.length >= 16 ? 3 : password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0
  points += classes >= 3 ? 1 : 0
  // mostly repeats, like "aaaa1111bbbb"; capped at 8 distinct, since a long passphrase reuses letters as any english does
  if(new Set(password).size < Math.min(password.length / 2, 8)) points -= 1

  return Math.max(1, Math.min(4, points)) as StrengthScore
}

function isSequence(value: string) {
  if(value.length < 3) return false
  const step = value.charCodeAt(1) - value.charCodeAt(0)
  if(Math.abs(step) !== 1) return false
  for(let index = 2; index < value.length; index++) {
    if(value.charCodeAt(index) - value.charCodeAt(index - 1) !== step) return false
  }
  return true
}
