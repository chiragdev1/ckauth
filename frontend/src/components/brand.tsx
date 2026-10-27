import { Link } from 'react-router'
import { cn } from '@/lib/utils.ts'

// shield, battlements and a keyhole gate: same drawing as public/favicon.svg
export function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <path d="M16 1.5 28 5.5v9.2c0 7.4-5 12.9-12 15.8C9 27.6 4 22.1 4 14.7V5.5z" className="fill-primary" />
      <path d="M8.5 12.5v-3h2.6v1.6h2.2V9.5h5.4v1.6h2.2V9.5h2.6v3z M8.5 13.5h15v6.8c0 3.6-3.3 6.6-7.5 8.2-4.2-1.6-7.5-4.6-7.5-8.2z" className="fill-background" />
      <circle cx="16" cy="18" r="2" className="fill-primary" />
      <path d="M15 19h2l.7 4.5h-3.4z" className="fill-primary" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}>
      <Crest className="transition-transform duration-300 group-hover:-rotate-6" />
      {/* the narrowest phones (320 px) keep just the crest, so the header controls still fit */}
      <span className="font-display text-lg font-bold tracking-[0.12em] uppercase max-[340px]:sr-only sm:text-xl">CKAuth</span>
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-24', className)} role="status" aria-label="Loading">
      <Crest className="size-10 animate-pulse" />
    </div>
  )
}
