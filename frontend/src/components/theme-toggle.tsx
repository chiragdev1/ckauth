import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme.tsx'
import { Button } from '@/components/ui/button.tsx'

// one click flips day and night; until the first click it follows the os, and picking the os's own theme goes back to following it.
// the home page is prerendered without knowing the visitor's theme, and react doesn't correct attributes that differ when it
// hydrates, so the icons switch with css (dark:) and aria-pressed only appears after mount
export function ThemeToggle() {
  const { resolvedTheme, systemTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function toggle() {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(next === systemTheme ? 'system' : next)
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Dark theme" aria-pressed={mounted ? resolvedTheme === 'dark' : undefined} title="Day / night" className="size-10 sm:size-9">
      <Sun className="size-[1.15rem] scale-100 rotate-0 transition-transform duration-500 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-[1.15rem] scale-0 rotate-90 transition-transform duration-500 dark:scale-100 dark:rotate-0" />
    </Button>
  )
}
