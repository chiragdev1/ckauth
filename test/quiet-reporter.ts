// the test output for people and agents reading it (pnpm test, test:coverage, test:only): one summary line when
// everything passes, full detail for every failure. pass or fail still comes from the runner's exit code, never from
// this file, so a bug here can hide detail but can't turn a failure green.
// what it always prints, because hiding it would hide a risk: every failure with its error, every known gap (todo),
// every skipped test and any coverage threshold missed. stderr is shown with the failures of the file that wrote it;
// otherwise one line counts it (the redis-down test logs its expected errors there, and dotenv a banner per file)
// in CI (GitHub Actions sets CI=true) it hands over to node's spec reporter: logs there are cheap and read rarely
import { relative } from 'node:path'
import { Readable } from 'node:stream'
import { inspect } from 'node:util'
import { spec } from 'node:test/reporters'
import type { TestEvent } from 'node:test/reporters'

type Source = AsyncIterable<TestEvent>

export default async function * quietReporter(source: Source): AsyncGenerator<string> {
  if(process.env.CI) {
    // spec is a stream (a Transform), not a generator: the events go in, its text comes out
    for await (const chunk of Readable.from(source).pipe(new spec())) yield String(chunk)
    return
  }

  const counts = new Map<string, string>()
  const todos: string[] = []
  const skipped: string[] = []
  let coverage = ''
  const stderrByFile = new Map<string, string[]>()
  const failedFiles = new Set<string>()
  let thresholdMissed = false

  for await (const event of source) {
    switch(event.type) {
      case 'test:fail': {
        const { name, file, details } = event.data
        const error = details.error as Error & { failureType?: string, cause?: unknown }
        // a suite fails when a test inside it does; that test is already printed in full
        if(error.failureType === 'subtestsFailed') break
        // the cause holds the assertion (actual, expected, the diff); the wrapper only says "test failed"
        const shown = error.cause ?? error
        if(file) failedFiles.add(shortPath(file))
        yield `\n✖ ${name}${file ? `  (${shortPath(file)})` : ''}\n${indent(inspect(shown, { depth: 4 }))}\n`
        break
      }
      case 'test:pass': {
        const { name, todo, skip } = event.data
        if(todo) todos.push(typeof todo === 'string' ? `${name}: ${todo}` : name)
        else if(skip) skipped.push(typeof skip === 'string' ? `${name}: ${skip}` : name)
        break
      }
      case 'test:stderr': {
        // stderr names the file relative to the folder, a failure names it in full: one form, so the two meet
        const file = event.data.file ? shortPath(event.data.file) : '(no file)'
        stderrByFile.set(file, [...(stderrByFile.get(file) ?? []), event.data.message])
        break
      }
      case 'test:diagnostic': {
        const { message, level, nesting } = event.data
        // a missed coverage threshold arrives as an error diagnostic; the end-of-run counts arrive as "pass 208" etc.
        if(level === 'error') {
          thresholdMissed = true
          yield `\n✖ ${message}\n`
        }
        else if(nesting === 0) {
          const [key, value] = message.split(' ')
          if(key && value && /^(tests|pass|fail|cancelled|skipped|todo|duration_ms)$/.test(key)) counts.set(key, value)
        }
        break
      }
      case 'test:coverage': {
        const totals = event.data.summary.totals
        coverage = ` · coverage: lines ${totals.coveredLinePercent.toFixed(1)}%, branches ${totals.coveredBranchPercent.toFixed(1)}%, functions ${totals.coveredFunctionPercent.toFixed(1)}%`
        break
      }
    }
  }

  let hiddenLines = 0
  for(const [file, lines] of stderrByFile) {
    if(failedFiles.has(file)) yield `\nstderr of ${file}:\n${indent(lines.join('').trimEnd())}\n`
    else hiddenLines += lines.join('').split('\n').filter(Boolean).length
  }
  if(hiddenLines) yield `stderr: ${hiddenLines} ${hiddenLines === 1 ? 'line' : 'lines'} from passing files not shown (CI=1 pnpm test prints everything)\n`

  // known gaps stay visible in every run (test/known-gaps.test.ts), and so does anything switched off
  for(const todo of todos) yield `todo: ${todo}\n`
  for(const skip of skipped) yield `skipped: ${skip}\n`
  const seconds = (Number(counts.get('duration_ms') ?? 0) / 1000).toFixed(1)
  const failed = Number(counts.get('fail') ?? 0) + Number(counts.get('cancelled') ?? 0)
  yield `${failed || thresholdMissed ? '✖' : '✔'} ${counts.get('pass') ?? 0} passed, ${counts.get('fail') ?? 0} failed, ${counts.get('cancelled') ?? 0} cancelled, ${counts.get('skipped') ?? 0} skipped, ${counts.get('todo') ?? 0} todo, of ${counts.get('tests') ?? 0} tests in ${seconds}s${coverage}\n`
}

function shortPath(file: string) {
  return relative(process.cwd(), file.replace(/^file:\/\//, ''))
}

function indent(text: string) {
  return text.split('\n').map(line => `    ${line}`).join('\n')
}
