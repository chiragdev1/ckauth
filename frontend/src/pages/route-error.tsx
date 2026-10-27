import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { useDocumentTitle } from '@/lib/use-document-title.ts'

// a lazy page whose chunk is gone (the tab predates a deploy) fails with one of these, depending on the browser
function isStaleChunk(error: unknown) {
  return error instanceof Error && /dynamically imported module|module script failed|Importing a module|Loading chunk/i.test(error.message)
}

// app.tsx puts this inside Layout, so a crashed page keeps the header and footer instead of react router's raw error screen
export function RouteError() {
  const error = useRouteError()
  const stale = isStaleChunk(error)
  useDocumentTitle(stale ? 'New version available' : 'Something went wrong')
  if(!stale) console.error(error)

  return (
    <div className="relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-24 text-center">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <p className="eyebrow">{stale ? 'Update ready' : isRouteErrorResponse(error) ? `Error ${error.status}` : 'Unexpected error'}</p>
      <h1 className="font-display mt-3 text-4xl font-bold sm:text-5xl">{stale ? 'CKAuth has been updated' : 'Something went wrong'}</h1>
      <p className="mt-4 max-w-sm text-muted-foreground">
        {stale ? 'Reload the page to get the latest version. Nothing you saved is lost.' : 'This page hit a problem. Reloading usually fixes it; if it doesn\'t, go back to the home page.'}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => window.location.reload()}>Reload the page</Button>
        {!stale && <Button asChild size="lg" variant="outline"><Link to="/">Go to the home page</Link></Button>}
      </div>
    </div>
  )
}
