// critical css for the prerendered home page (scripts/prerender.js): tailwind builds one stylesheet from every source
// file, so inlining all of it makes the landing page pay for the dashboard, admin and every page still to come.
// this keeps only the rules the home page can use; the full sheet still loads (end of <body>) for everything else.
// frontend/scripts/check-dist.js checks the result with its own code, so a bug here can't hide itself
import postcss from 'postcss'

// `.md\:grid-cols-2` → `md:grid-cols-2`, `.\31 0` → `10`: css escapes back to the class name the markup carries
// (the css rule: a backslash and 1–6 hex digits, plus one optional space, is a code point; a backslash and any other
// character is that character)
const unescape = name => name.replace(/\\(?:([0-9a-fA-F]{1,6})\s?|(.))/g, (_, hex, char) => hex ? String.fromCodePoint(parseInt(hex, 16)) : char)
const classesOf = selector => [...selector.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+)/g)].map(match => unescape(match[1]))

// `used` is the text that can put a class on the page: the prerendered markup and the javascript the home page loads
// first. a selector stays when every class in it appears there somewhere. a substring test, so it errs towards keeping
// (a class that only appears inside another word stays too), never towards dropping one the page uses
export function criticalCss(css, used) {
  const root = postcss.parse(css)
  root.walkRules(rule => {
    // @keyframes steps (from, 50%) are rules too; they hold no classes and stay with their animation
    if(rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
    const kept = rule.selectors.filter(selector => classesOf(selector).every(name => used.includes(name)))
    if(!kept.length) rule.remove()
    else if(kept.length < rule.selectors.length) rule.selectors = kept
  })
  // drop @media/@supports/@layer blocks left empty; `@layer a, b;` has no block (nodes undefined) and stays,
  // because it fixes the cascade order of the layers
  let emptied = true
  while(emptied) {
    emptied = false
    root.walkAtRules(atRule => {
      if(Array.isArray(atRule.nodes) && atRule.nodes.length === 0) { atRule.remove(); emptied = true }
    })
  }
  return root.toString()
}
