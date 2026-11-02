// "Chrome on Windows" from a user agent, for emails; the same rules as the dashboard's frontend/src/lib/device.ts.
// a rough guess on purpose: the header is whatever the browser claims. order matters: Edge and Opera also say "Chrome",
// and Chrome says "Safari"
const browsers: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const systems: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

export function describeDevice(userAgent: string | null) {
  if(!userAgent) return 'an unknown device'
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = systems.find(([pattern]) => pattern.test(userAgent))?.[1]
  if(browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'an unknown device'
}
