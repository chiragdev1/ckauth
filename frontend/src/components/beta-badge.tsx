import { Badge } from '@/components/ui/badge.tsx'
import { cn } from '@/lib/utils.ts'

// sign in with ckauth (the oidc provider) is in beta; the rest of ckauth is released, so this label only goes on its pages
export function BetaBadge({ className }: { className?: string }) {
  return <Badge variant="outline" className={cn('border-primary/40 text-primary', className)}>Beta</Badge>
}

// a word alone doesn't explain itself: this line goes in the footer of every page that shows the badge
export function BetaNote() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">Beta.</span> Sign in with CKAuth is new and may still change. The rest of CKAuth is fully released.
    </p>
  )
}
