// "3 minutes ago", "yesterday", in the browser's language. past a week a date reads better than "5 weeks ago"
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function timeAgo(value: string | Date, now = new Date(), locale?: string) {
  const elapsed = now.getTime() - new Date(value).getTime()
  if(elapsed < 60 * 1000) return 'just now'
  if(elapsed >= 7 * 24 * 60 * 60 * 1000) {
    return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const [unit, size] = units.find(([, size]) => elapsed >= size)!
  return format.format(-Math.floor(elapsed / size), unit)
}
