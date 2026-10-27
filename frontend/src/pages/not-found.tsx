import { Link } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-24 text-center">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <p className="eyebrow">Page not found</p>
      <h1 className="font-display mt-3 text-8xl font-bold">404</h1>
      <p className="mt-4 max-w-sm text-muted-foreground">We couldn't find this page. It may have moved, or the link may be wrong.</p>
      <Button asChild size="lg" className="mt-8">
        <Link to="/">Go to the home page</Link>
      </Button>
    </div>
  )
}
