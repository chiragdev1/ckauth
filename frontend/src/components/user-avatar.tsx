import type { User } from '@/lib/api.ts'
import { cn } from '@/lib/utils.ts'

export function UserAvatar({ user, className }: { user: Pick<User, 'firstName' | 'lastName' | 'avatarUrl'>, className?: string }) {
  const initials = `${user.firstName[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()

  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={cn('rounded-full object-cover ring-2 ring-border', className)} />
  ) : (
    <span className={cn('font-display flex items-center justify-center rounded-full bg-secondary text-sm font-medium tracking-wider text-secondary-foreground ring-2 ring-border', className)}>
      {initials}
    </span>
  )
}
