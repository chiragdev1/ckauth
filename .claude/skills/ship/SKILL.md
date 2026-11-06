---
name: ship
description: Finish a branch for review in a fresh, cheap context: tests, docs, pnpm check:pr, docs artifact, Conventional Commits, then PR and merge text. Use when the user says commit, merge, ship or prepare for PR. Pass a short summary of what was built and any decisions made as the arguments, because this skill can't see the conversation.
context: fork
agent: general-purpose
model: sonnet
---

# Ship the current branch

You are finishing work on a branch of CKAuth. You start without the conversation that built it; everything you need is in the repo, in git and in the summary below.

**What the main session says was built:**

$ARGUMENTS

## 1. Find out what changed

- Read `CLAUDE.md` (already loaded), then `DEVLOG.md` (latest entry, "Next up") and skim `LEARNINGS.md`'s topics.
- `git status`, `git log --oneline main..HEAD`, `git diff main...HEAD --stat`, then the diff itself for anything uncommitted and anything the summary doesn't explain.
- The user's "commit" or "merge" means: do every applicable item below **without asking**.

## 2. Tests

- A new endpoint, rule or behaviour gets tests in the same change (see CLAUDE.md → Tests). Break the code once and watch each new test fail, then restore it.
- Run `pnpm test` (needs Postgres; if it isn't reachable, say so and ask the user to start it: never run docker commands, Docker Desktop hangs).

## 3. Docs (only the files the change actually affects)

- `DEVLOG.md`: a dated `## <date> · <title>` entry above the `---` before "Lessons"; short bullets with what changed and why; update "Next up" and "Future scope".
- `LEARNINGS.md`: each mistake or lesson under its topic, as *what went wrong → fix → **Rule:***, with the commit hash once known.
- `docs/API.md` (endpoints, payloads, status codes, the rate-limit table), `CLAUDE.md` (layout, rules, known gaps: remove a gap once fixed), `README.md` (setup, scripts, env vars), `docs/DEPLOYMENT.md` + `deploy/api.env.sample` (env vars, deploy steps), `docs/GLOSSARY.md` (every new term).
- Docs are for beginners but professional: keep the technical term and explain it on first use.
- `frontend/src/pages/legal.tsx`: if stored fields, cookies, emails, processors or retention changed, update the policy and bump its date.
- **Search copy:** if a user-visible feature shipped or was removed, update `<title>`, meta description, `og:title` and `og:description` in `frontend/index.html`. Title 50–60 characters, topic words first; description 140–160 with a call to action; both true to what the live site does. A new headline also means updating `og-image.svg` and `brand/social-header.svg` and running `pnpm brand:images`, which re-renders every brand PNG (`docs/BRAND.md` lists them).

## 4. Checks

- `pnpm check:pr` must pass (`scripts/check-pr.js`; the rules live in `scripts/check-repo.js` and `frontend/scripts/check-dist.js`). A failure follows "When to stop" below: fix docs and doc links yourself, and report everything else. Never silence a check.
- A new rule in CLAUDE.md gets a check there too, proven to fail once on a broken input. Raising a size budget in `check-dist.js` needs a dated reason next to it.
- `pnpm docs:artifact`: fix every `broken link:` line. A new doc goes in the `docs` list in `scripts/docs-artifact/build.js`.
- **Docs artifact** ("CKAuth Docs", https://claude.ai/artifact/KxwMJmZRKynEW54KKGzhaD): republish `.docs-artifact/ckauth-docs.html` to that URL only if the Artifact tool's `list` shows the last update was 3 or more days ago (at most twice a week). Read it with the Artifact tool first. Otherwise, say when the next republish is due.

## When to stop instead of carrying on

Check these in priority order; the first one that applies decides what happens. Whatever happens, you end with the developer report (step 6).

1. **A security check fails: stop everything.** That means any failure in `test/sign-up`, `verify-email`, `sign-in`, `session`, `password`, `rate-limits`, `admin`, `upload-avatar`, `activity` or `redis-down`; any security-rule step of `scripts/check-repo.js` (secrets, token hashing, enumeration, logging rules); `pnpm audit --prod`; or a diff that weakens a rule in CLAUDE.md → Security rules. Don't edit, retry around it or commit; go straight to the report.
2. **A change can't easily be undone: stop everything.** For example: a new or edited migration in `drizzle/` (rollbacks don't undo migrations), a schema change without its migration, deleting or rewriting data, a new env var the VPS needs before the deploy, a breaking API change, anything that needs a push or force-push, or a republish that would break the 3-day rule. Commit nothing; report.
3. **Any other code problem: don't fix it, don't commit.** For example: a build or type error, a non-security test failure, a knip finding, a size budget, a diff much bigger than the summary describes. Finish the docs steps if they're safe on their own, then report.
4. **Only docs need work: your call.** Make the edits, then do **two rounds of review and rewrite**. Round 1: is everything true to the code, nothing missing, every new term in the glossary? Round 2: is it clear to a beginner, short, and in the house style? Then commit and report.

Code you write here (tests, checks) must meet industry standard: it matches the surrounding code, follows CLAUDE.md's conventions, has no shortcuts like `any` where a type exists, and no skipped or loosened assertions.

## 5. Commit

- Conventional Commits (`feat(auth): …`, `fix(web): …`), one commit per feature when the branch holds several, with a body explaining *why* for any behaviour or security change. Breaking changes get a `BREAKING CHANGE:` footer.
- End each message with the attribution line from the system reminder.
- `pnpm build` (and `cd frontend && pnpm build` if `frontend/` changed) before every commit. Never push.

## 6. Report back (your final message is all the main session sees)

Start with one line naming the audience ("Written for: the developer, before deciding what to fix"), then the **developer report**, always, even when nothing went wrong. Write it in plain words a beginner can follow: explain each technical term in a few words the first time.

- **Outcome:** one line: shipped, stopped (and at which priority above), or partly done.
- **Problems found:** one table row per error or bug: `#`, what's wrong (in plain words), where (`file:line`), severity (critical / high / medium / low), scale (how many places or users it affects), and the evidence (the failing test name or a short error excerpt). **Describe problems only, no fixes, no patch hints.** The developer judges scale and severity first.
- **Best practices to learn from:** 2–5 short points, each tied to something in this diff: the industry practice, why it matters, and whether this change follows it.
- **Next:** "Ask for solutions to any problem by its number; each comes with at least three ways to solve it and their trade-offs."

If nothing stopped the run, add after the report:

1. **What you did:** commits (hash + title), docs touched, tests added, `check:pr` result, artifact republished or when it's due.
2. **PR title**, Conventional Commits style.
3. **PR description:** Summary (what and why), Changes (grouped), How it was tested (real checks and their results), Deploy notes (env vars, migrations, which workflow runs, anything to do on the VPS first), Follow-ups / known gaps, then `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. **Merge commit title + description** for GitHub's "Create a merge commit": `Merge pull request #N from chiragdev1/<branch>`. Work out N as the highest real `#N` in `git log --merges` plus one (c92c5e3 was pasted with a literal `#<n>`, so count it as the one after #5), never a placeholder, and tell the user to check it against the PR page, since issues share the counter. Body: a short summary plus the commit list.

Put the PR and merge texts in fenced blocks so they can be pasted. `gh` isn't installed locally.
