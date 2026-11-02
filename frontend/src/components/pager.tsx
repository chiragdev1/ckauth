import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'

type Paged = { page: number, totalPages: number, setPage: (page: number) => void, loading: boolean }

// previous / next under a paged list; hidden while everything fits on one page
export function Pager({ data, label = 'Pages' }: { data: Paged, label?: string }) {
  if(data.totalPages <= 1) return null

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4 text-sm">
      <Button variant="outline" size="sm" onClick={() => data.setPage(data.page - 1)} disabled={data.page <= 1 || data.loading}>
        <ChevronLeft />Previous
      </Button>
      <span className="text-muted-foreground tabular-nums">Page {data.page} of {data.totalPages}</span>
      <Button variant="outline" size="sm" onClick={() => data.setPage(data.page + 1)} disabled={data.page >= data.totalPages || data.loading}>
        Next<ChevronRight />
      </Button>
    </nav>
  )
}
