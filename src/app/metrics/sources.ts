// the ?ref= values our own links carry. a source is only a label on a counter, so anything else is dropped rather than
// stored: otherwise anyone could fill referral_visits with made-up rows, or put text of their choice into the admin panel
export const referralSources = ['x'] as const

export type ReferralSource = typeof referralSources[number]

// turns whatever arrived as ?ref= into a known source, or null. never throws: a bad ref must never cost a visit or a sign-up
export function normalizeRefSource(raw: unknown): ReferralSource | null {
  // only strings, and only short ones: a 5 MB body shouldn't even be lowercased
  if(typeof raw !== 'string' || raw.length > 32) return null
  // trimmed and lowercased: apps change the case of shared links and people retype them, so ' X' is still x
  const value = raw.trim().toLowerCase()
  return referralSources.includes(value as ReferralSource) ? value as ReferralSource : null
}
