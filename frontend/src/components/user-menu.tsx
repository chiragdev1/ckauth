import { Link, useNavigate } from 'react-router'
import { LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth.tsx'
import { UserAvatar } from '@/components/user-avatar.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.tsx'

// its own file so layout.tsx can lazy-load it: only signed-in users see it, and the radix menu + floating-ui
// behind it are a large share of the bundle that signed-out visitors (and the prerendered home page) never use
export default function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if(!user) return null

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Account menu">
          <UserAvatar user={user} className="size-9" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium">{[user.firstName, user.lastName].filter(Boolean).join(' ')}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard"><LayoutDashboard />Dashboard</Link>
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin"><ShieldCheck />Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
