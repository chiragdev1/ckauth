---
name: ui-change
description: Agree the direction of a CKAuth UI change before building it. Use for any visual redesign, new page look, layout or theme change, or restyling of a component (tables, cards, emails). Not for copy edits or a fix the user has already described exactly.
---

# A UI change, direction first

Built versions are the expensive way to find out what the user wants (a redesign → revert → spacing → classic cycle once cost more than the feature). So settle the direction in text, then build.

## 1. Pin down the brief (one message, then wait)

Reply with:

- **What stays:** what you'll leave alone ("keep the current table, its columns and colours").
- **What changes:** the specific problem being fixed, in one line.
- **2–3 ASCII sketches**, a few lines each, of how the result could look (at phone width too, if the layout differs). Label them A, B, C, mark the one you'd pick, and give one line on why.
- Any question whose answer changes what you build. Batch them all into this one message.

Then stop and wait. Don't write code until the user picks.

**Skip the sketches** when the user already described the result exactly ("make the gap 16px", "use text labels"): just make that change.

## 2. Build in the design lab

For a redesign or a new page's look, build the picked direction (plus at most one variant, if the user asked for options) as looks in `frontend/src/lib/design-lab.tsx`:

- Add entries to `looks`; the first entry is the shipped design and stays first.
- Token blocks go in `frontend/src/index.css` as `:root[data-look="<id>"]` plus a `.dark` block.
- Branch on `useLook()` only where the markup differs.
- The user switches on the real pages with Alt+1…9, Alt+T (day/night) or `?look=<id>`.

A small tweak to the shipped design doesn't need a look: edit it in place.

## 3. Rules every look must follow

- Colours are tokens in `index.css`; `dark:` follows the `.dark` class. Check light and dark.
- Contrast stays at WCAG AA: no opacity modifiers on text.
- No illustrations: backdrops are CSS only (`.bg-grid`, `.bg-wall`), and any themed art is original.
- The home page is prerendered: no `window`/`document` at render, and no theme-, auth- or date-dependent markup on the first pass.
- Shared shadcn pieces are in `frontend/src/components/ui/` (edit freely).
- `cd frontend && pnpm build` before handing it over; it enforces the size budgets.

## 4. After the user picks

Promote the winner to the default tokens and markup, delete the losing looks (their tokens, branches and any fonts they added), and keep the lab itself, so `looks` is back to one entry. End with the usual follow-up checklist (tests, docs) marked do/skip.
