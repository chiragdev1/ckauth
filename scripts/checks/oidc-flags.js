// docs/OIDC.md rule 27: no trusted, first-party or skip-consent flag, in the schema or in the code. no app may skip consent,
// pkce, the exact redirect match, scope limits or pairwise ids, so there is no setting that would let one.
// used by scripts/check-repo.js; its own tests are oidc-flags.test.js (pnpm check:pr runs both).
//
// how it decides: every identifier, identifier-like string, env key and sql name is split into words
// (skipConsent, skip_consent and SKIP_CONSENT all become [skip, consent]), and the words are matched, so camelCase,
// word order and inflections ("consentSkipped") don't slip past. comments and prose (error messages, page copy) are
// never read: a comment explaining the rule must not trip it, and "can't sign in without PKCE" is not a flag.
//
// it's a tripwire for the honest version of the mistake (a "temporary" trusted: true under deadline pressure), not a
// wall: a flag named x7 gets through. the per-rule tests and code review stop the rest

// ---- scope ----------------------------------------------------------------------------------------------------------

// "oidc" files get every rule; elsewhere only the rules that can't mean anything but an oidc exemption run, so an
// unrelated feature (a "trusted device" for mfa, a "skip redirect" in the router) isn't blocked by this one
const oidcPath = /(oauth|oidc|openid|consent|connected[-_]?apps?)/i

export function scopeOf(file) {
  if(/^drizzle\/.*\.sql$/.test(file)) return {kind: 'sql', oidc: true, declare: true}
  // the schema declares settings: a column that could hold "off" is the flag, whatever value it starts with
  if(file === 'src/db/schema.ts') return {kind: 'code', oidc: true, declare: true}
  if(/(^|\/)\.env\.sample$/.test(file) || /^deploy\/.*\.env\.sample$/.test(file) || /(^|\/)compose\.ya?ml$/.test(file)) {
    return {kind: 'env', oidc: false, declare: true}
  }
  if(/^(src|frontend\/src)\/.*\.(ts|tsx)$/.test(file)) {
    // admin is where apps get registered, and manage-users is the out-of-band power tool: both are where an
    // exemption would be added
    const oidc = oidcPath.test(file) || file.startsWith('src/app/admin/') || file.startsWith('src/scripts/') ||
      /^frontend\/src\/(pages|lib)\/admin/.test(file)
    return {kind: 'code', oidc, declare: false}
  }
  return null
}

// ---- words ----------------------------------------------------------------------------------------------------------

export function splitWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // PKCERequired → PKCE Required
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(word => word.toLowerCase())
}

// the five protections rule 27 names. consent, pkce and pairwise mean nothing outside oidc, so they're checked
// everywhere; "redirect" and "scope" are everyday words elsewhere, so only in oidc files
const coreProtection = /^(consents?|consented|pkce|pairwise)$/
const oidcProtection = /^(redirects?|scopes?)$/
// "skip consent" order
const offBefore = /^(skip|skips|skipping|bypass|bypasses|bypassing|disable|disables|disabling|ignore|ignores|ignoring|omit|omits|waive|waives|suppress|override|overrides|relax|loosen|exempt|exempts)$/
// these two only right before the protection: "noConsent" is a flag, "noMatchingRedirect" is an error name
const offJustBefore = /^(no|without)$/
// "consent skipped" order
const offAfter = /^(skipped|bypassed|disabled|ignored|omitted|waived|exempt|exempted|optional|off|overridden|suppressed|relaxed|loose|lenient|unchecked|unenforced)$/
// a setting about a protection: fine as a function (requirePkce(req) enforces it), a flag once it's declared or false
const requirement = /^(require|required|requires|enforce|enforced|enforces|check|checks|verify|validate|strict|exact|must|mandatory)$/
// "this app is special"
const trustWord = /^(trust|trusted|trustworthy|firstparty|privileged|exempt|whitelisted|allowlisted)$/
const appWord = /^(clients?|apps?|applications?)$/
const autoPrefix = /^(auto|pre)$/
const approval = /^(approv\w*|consent\w*|grant\w*|authoriz\w*)$/
const looseMatch = /^(wildcards?|prefix|prefixes|patterns?|regexp?|glob|fuzzy|loose|partial|any|startswith|subdomains?)$/
// all-lowercase names with no separators (a sql column like skipconsent)
const compounds = [
  [/(skip|bypass|disable|ignore|without|no)(consent|pkce|pairwise)/, 'turns a protection off', false],
  [/(autoapprov|preapprov|preauthoriz|autoconsent|preconsent|autogrant)/, 'approves without asking', false],
  [/(trusted|firstparty)/, 'marks an app as trusted', true],
  [/(require|enforce)(consent|pkce|pairwise)/, 'declares a setting that could turn a protection off', false, true],
]

const near = (a, b) => b > a && b - a <= 2

// why a name is a rule 27 flag, or null
export function flagReason(name, {oidc = false, declare = false} = {}) {
  const words = splitWords(name)
  const protection = word => coreProtection.test(word) || (oidc && oidcProtection.test(word))
  for(let a = 0; a < words.length; a++) {
    for(let b = 0; b < words.length; b++) {
      if(!protection(words[b]) && !protection(words[a])) continue
      if(protection(words[b]) && near(a, b) && offBefore.test(words[a])) return 'turns a protection off'
      if(protection(words[b]) && b === a + 1 && offJustBefore.test(words[a])) return 'turns a protection off'
      if(protection(words[a]) && near(a, b) && offAfter.test(words[b])) return 'turns a protection off'
      if(declare && (near(a, b) || near(b, a)) && protection(words[a]) && requirement.test(words[b])) {
        return 'declares a setting that could turn a protection off'
      }
    }
  }
  for(let a = 0; a + 1 < words.length; a++) {
    if(autoPrefix.test(words[a]) && approval.test(words[a + 1])) return 'approves without asking'
    if(words[a] === 'implicit' && /^(approv|consent)/.test(words[a + 1])) return 'approves without asking'
  }
  if(oidc) {
    if(words.some(word => trustWord.test(word))) return 'marks an app as trusted'
    for(let a = 0; a + 1 < words.length; a++) {
      if(words[a] === 'first' && words[a + 1] === 'party') return 'marks an app as trusted'
      if(words[a] === 'internal' && appWord.test(words[a + 1])) return 'marks an app as trusted'
    }
    if(words.some(word => /^redirects?$/.test(word)) && words.some(word => looseMatch.test(word))) {
      return 'loosens the exact redirect match'
    }
  }
  if(words.length === 1) {
    for(const [pattern, reason, oidcOnly, declareOnly] of compounds) {
      if(pattern.test(words[0]) && (!oidcOnly || oidc) && (!declareOnly || declare)) return reason
    }
  }
  return null
}

// ---- tokens ---------------------------------------------------------------------------------------------------------

// after these a "/" starts a regex literal, not a division
const keywordsBeforeRegex = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof'])
const operators = ['===', '!==', '...', '==', '!=', '=>', '<=', '>=', '?.', '??', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=']

// a small ts/tsx/js lexer: names, strings (template parts included), numbers and punctuation, each with its line.
// comments and regex literals are dropped, so a "//" inside a string or a regex never hides the rest of a line
export function tokenize(source) {
  const tokens = []
  const n = source.length
  let i = 0
  let line = 1
  let braceDepth = 0
  // the brace depth each open `${` closes at, innermost last
  const templateStack = []
  const push = (type, value, at = line) => tokens.push({type, value, line: at})

  // i is just past a ` or the } that ends a ${…}; reads up to the closing ` or the next ${
  function readTemplate() {
    const start = line
    let text = ''
    while(i < n) {
      const char = source[i]
      if(char === '\\') { if(source[i + 1] === '\n') line++; text += source[i + 1] ?? ''; i += 2; continue }
      if(char === '`') { i++; push('string', text, start); return }
      if(char === '$' && source[i + 1] === '{') {
        i += 2
        push('string', text, start)
        braceDepth++
        templateStack.push(braceDepth)
        return
      }
      if(char === '\n') line++
      text += char
      i++
    }
    push('string', text, start)
  }

  function regexAllowed() {
    const previous = tokens[tokens.length - 1]
    if(!previous) return true
    // "</p>" in jsx is a closing tag, not a regex
    if(previous.type === 'punct') return ![')', ']', '}', '<'].includes(previous.value)
    return previous.type === 'name' && keywordsBeforeRegex.has(previous.value)
  }

  while(i < n) {
    const char = source[i]
    if(char === '\n') { line++; i++; continue }
    if(/\s/.test(char)) { i++; continue }
    if(char === '/' && source[i + 1] === '/') { while(i < n && source[i] !== '\n') i++; continue }
    if(char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      for(let j = i; j < stop; j++) if(source[j] === '\n') line++
      i = stop
      continue
    }
    if(char === '"' || char === "'") {
      // a quoted string ends at its quote or at the end of the line, so an apostrophe in jsx text ("don't") blurs
      // at most that one line
      let text = ''
      i++
      while(i < n && source[i] !== char && source[i] !== '\n') {
        if(source[i] === '\\' && source[i + 1] !== '\n') { text += source[i + 1] ?? ''; i += 2; continue }
        text += source[i]
        i++
      }
      if(source[i] === char) i++
      push('string', text)
      continue
    }
    if(char === '`') { i++; readTemplate(); continue }
    if(char === '/' && regexAllowed()) {
      i++
      let inClass = false
      while(i < n && source[i] !== '\n') {
        if(source[i] === '\\') { i += 2; continue }
        if(source[i] === '[') inClass = true
        else if(source[i] === ']') inClass = false
        else if(source[i] === '/' && !inClass) break
        i++
      }
      i++
      while(i < n && /[a-z]/i.test(source[i])) i++
      push('regex', '')
      continue
    }
    if(/[A-Za-z_$#]/.test(char)) {
      let j = i + 1
      while(j < n && /[\w$]/.test(source[j])) j++
      push('name', source.slice(i, j))
      i = j
      continue
    }
    if(/[0-9]/.test(char)) {
      let j = i + 1
      while(j < n && /[\w.]/.test(source[j])) j++
      push('number', source.slice(i, j))
      i = j
      continue
    }
    if(char === '{') { braceDepth++; push('punct', '{'); i++; continue }
    if(char === '}') {
      if(templateStack.length && templateStack[templateStack.length - 1] === braceDepth) {
        templateStack.pop()
        braceDepth--
        i++
        readTemplate()
        continue
      }
      braceDepth--
      push('punct', '}')
      i++
      continue
    }
    const operator = operators.find(op => source.startsWith(op, i)) ?? char
    push('punct', operator)
    i += operator.length
  }
  return tokens
}

// ---- findings -------------------------------------------------------------------------------------------------------

// a string is read as a name only when it looks like one ('skip_consent', 'trustedClient'); prose with spaces is copy
const nameLike = text => text.length <= 64 && /^[A-Za-z_$][\w$.:-]*$/.test(text)
const looseMethods = new Set(['startsWith', 'endsWith', 'includes', 'indexOf', 'match', 'search'])
const isRedirectName = token => token?.type === 'name' && splitWords(token.value).some(word => /^redirects?$/.test(word))
// redirectUris.includes(x) is array membership, which is an exact match
const isPlural = token => /s$/i.test(token.value)

function codeFindings(source, scope) {
  const tokens = tokenize(source)
  const found = []
  tokens.forEach((token, index) => {
    const next = tokens[index + 1]
    const afterNext = tokens[index + 2]
    if(token.type === 'name' || (token.type === 'string' && nameLike(token.value))) {
      const reason = flagReason(token.value, scope)
      if(reason) { found.push({line: token.line, name: token.value, reason}); return }
      // requirePkce: false, pkce = false, consentRequired: false
      const words = splitWords(token.value)
      const aboutProtection = words.some(word => coreProtection.test(word) || (scope.oidc && oidcProtection.test(word)))
      const isSetting = aboutProtection && (words.length === 1 || words.some(word => requirement.test(word)))
      if(isSetting && next?.type === 'punct' && (next.value === ':' || next.value === '=') && afterNext?.type === 'name' && afterNext.value === 'false') {
        found.push({line: token.line, name: `${token.value}${next.value} false`, reason: 'switches a protection off'})
      }
    }
    if(!scope.oidc || token.type !== 'name' || !next || next.type !== 'punct' || !['.', '?.'].includes(next.value)) return
    const method = afterNext
    const call = tokens[index + 3]
    const argument = tokens[index + 4]
    if(method?.type !== 'name' || call?.value !== '(') return
    // redirectUri.startsWith(registered): a prefix or substring match. a literal argument is a format check
    // (startsWith('https://'), includes('#')), which is how registration validates a uri, so only a variable counts
    if(isRedirectName(token) && !isPlural(token) && looseMethods.has(method.value) && argument?.type === 'name') {
      found.push({line: token.line, name: `${token.value}.${method.value}(${argument.value})`, reason: 'compares a redirect uri loosely; compare the whole string with ==='})
    }
    // pattern.test(redirectUri): a registered pattern instead of an exact uri. a regex literal (/^https:/) is a format check
    if(method.value === 'test' && isRedirectName(argument)) {
      found.push({line: token.line, name: `${token.value}.test(${argument.value})`, reason: 'matches a redirect uri against a pattern; compare the whole string with ==='})
    }
  })
  return found
}

function sqlFindings(source, scope) {
  // comments out, line breaks kept so line numbers stay right
  const text = source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, '')).replace(/--[^\n]*/g, '')
  const found = []
  for(const match of text.matchAll(/"([^"]+)"|'((?:[^']|'')*)'|\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const name = match[1] ?? match[2] ?? match[0]
    if(match[2] !== undefined && !nameLike(name)) continue
    const reason = flagReason(name, scope)
    if(reason) found.push({line: text.slice(0, match.index).split('\n').length, name, reason})
  }
  return found
}

function envFindings(source, scope) {
  const found = []
  source.split('\n').forEach((line, index) => {
    const code = line.replace(/(^|\s)#.*$/, '')
    for(const [name] of code.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
      // OIDC_TRUSTED_CLIENTS is an oidc setting; LOG_LEVEL isn't, and gets only the everywhere rules
      const reason = flagReason(name, {...scope, oidc: /^(OIDC|OAUTH|OPENID)_/.test(name)})
      if(reason) found.push({line: index + 1, name, reason})
    }
  })
  return found
}

// every rule 27 flag in a file, as {line, name, reason}; [] for a file out of scope
export function findOidcFlags(file, source) {
  const scope = scopeOf(file)
  if(!scope) return []
  const found = scope.kind === 'sql' ? sqlFindings(source, scope) : scope.kind === 'env' ? envFindings(source, scope) : codeFindings(source, scope)
  // one line per name and reason, however often it repeats there
  const seen = new Set()
  return found.filter(({line, name, reason}) => !seen.has(`${line} ${name} ${reason}`) && seen.add(`${line} ${name} ${reason}`))
}
