// github's heading anchors: lowercase, drop punctuation and symbols, spaces become hyphens.
// the build injects this exact function into the page, so link checks and page ids can't disagree
export function slugify(text) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}
