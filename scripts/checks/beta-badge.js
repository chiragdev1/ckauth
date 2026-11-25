// CLAUDE.md → Frontend: "the Beta badge goes on every OIDC page and nowhere else". an oidc file is a page or component
// whose name says oauth or oidc. each one must show the badge itself or import an oidc component that does (one level
// is enough: pages wrap a single screen), and nothing else may import the badge
const OIDC_FILE = /^frontend\/src\/(pages|components)\/[^/]*(oauth|oidc)[^/]*\.tsx$/
const BADGE_MODULE = 'frontend/src/components/beta-badge.tsx'
const showsBadge = source => /<Beta(Badge|Note)\b/.test(source)

export const isOidcFile = file => OIDC_FILE.test(file)

// '@/components/x.tsx' → 'frontend/src/components/x.tsx'
const importsOf = source => [...source.matchAll(/from '@\/([^']+?)(\.tsx)?'/g)].map(match => `frontend/src/${match[1]}.tsx`)

// files: Map of repo path → source, for every .tsx under frontend/src. returns failure messages
export function checkBetaBadge(files) {
  const failures = []
  const oidcFiles = [...files.keys()].filter(isOidcFile)
  // an empty scope would pass forever: a renamed folder or component must fail here, not go unchecked
  if(!oidcFiles.length) failures.push('no OIDC pages or components found (frontend/src/{pages,components}/*oauth*|*oidc*.tsx): fix OIDC_FILE in scripts/checks/beta-badge.js')
  for(const [file, source] of files) {
    if(file !== BADGE_MODULE && !isOidcFile(file) && importsOf(source).includes(BADGE_MODULE)) {
      failures.push(`${file}: imports the Beta badge, which goes only on OIDC pages (CLAUDE.md → Frontend)`)
    }
  }
  for(const file of oidcFiles) {
    const source = files.get(file)
    const shown = showsBadge(source) || importsOf(source).some(imported => isOidcFile(imported) && showsBadge(files.get(imported) ?? ''))
    if(!shown) failures.push(`${file}: an OIDC page must show the Beta badge (<BetaBadge /> or <BetaNote />, or an OIDC component that does) (CLAUDE.md → Frontend)`)
  }
  return failures
}
