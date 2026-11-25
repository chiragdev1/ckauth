// the stricter coverage bar for sign in with ckauth: 100% of lines and branches in src/app/oidc/ and src/app/oauth/.
// protocol code has no unimportant branch: an untested `if` there is an untested security rule. the repo-wide bar
// (95 / 83 / 85) is in package.json; node's test runner takes one bar per run, so the same `pnpm test:coverage` run
// also writes coverage/lcov.info and this reads it, file by file. run at the end of test:coverage (ci and check:pr)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const report = 'coverage/lcov.info'
const strict = [/^src\/app\/oidc\//, /^src\/app\/oauth\//]

if(!existsSync(report)) {
  console.error(`check-coverage: ${report} is missing; run it through pnpm test:coverage`)
  process.exit(1)
}

const failures = []
let checked = 0
// lcov: one "SF:<file>" … "end_of_record" block per file. LF/LH = lines found/hit, BRF/BRH = branches found/hit;
// DA:<line>,<hits> and BRDA:<line>,<block>,<branch>,<hits> say which ones were missed
for(const block of readFileSync(report, 'utf8').split('end_of_record')) {
  const source = block.match(/^SF:(.+)$/m)?.[1]
  if(!source) continue
  const file = path.relative(process.cwd(), source).split(path.sep).join('/')
  if(!strict.some(pattern => pattern.test(file))) continue
  checked++
  const count = key => Number(block.match(new RegExp(`^${key}:(\\d+)$`, 'm'))?.[1] ?? 0)
  const missedLines = [...block.matchAll(/^DA:(\d+),0$/gm)].map(match => match[1])
  const missedBranches = [...new Set([...block.matchAll(/^BRDA:(\d+),\d+,\d+,(?:0|-)$/gm)].map(match => match[1]))]
  if(count('LH') < count('LF')) failures.push(`${file}: lines ${count('LH')}/${count('LF')}, untested line(s) ${missedLines.join(', ')}`)
  if(count('BRH') < count('BRF')) failures.push(`${file}: branches ${count('BRH')}/${count('BRF')}, untested branch(es) on line(s) ${missedBranches.join(', ')}`)
}

// a moved folder or a changed report format would otherwise pass with nothing checked
if(!checked) failures.push(`no file under src/app/oidc/ or src/app/oauth/ in ${report}: the report or the folders moved`)

for(const failure of failures) console.error(`  FAIL  ${failure}`)
const below = new Set(failures.map(failure => failure.split(':')[0])).size
console.log(`oidc coverage: ${checked - below} of ${checked} files at 100% lines and branches`)
process.exit(failures.length ? 1 : 0)
