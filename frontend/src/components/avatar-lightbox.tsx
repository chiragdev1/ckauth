import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { User } from '@/lib/api.ts'
import { UserAvatar } from './user-avatar.tsx'

type AvatarUser = Pick<User, 'firstName' | 'lastName' | 'avatarUrl'>

// the avatar, and with a photo, a button that opens it full size. without a photo there's nothing bigger to show,
// so it stays a plain avatar instead of a button that does nothing
export function AvatarLightbox({ user, className }: { user: AvatarUser, className?: string }) {
  const [open, setOpen] = useState(false)
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')

  if(!user.avatarUrl) return <UserAvatar user={user} className={className} />

  // radix gives the focus trap, scroll lock, escape and focus return. the photo opens as a big rounded square, cropped to
  // fill it, growing out of the avatar like a profile picture in a messaging app; min(…vw, …vh) keeps it whole on phones
  // and short laptop screens. no chrome around it, so a tap anywhere closes it
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={`View ${name}'s profile picture`}
        className="cursor-zoom-in rounded-full transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <UserAvatar user={user} className={className} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content onClick={() => setOpen(false)} className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-4 focus:outline-none">
          <Dialog.Title className="sr-only">{name}</Dialog.Title>
          <Dialog.Description className="sr-only">Profile picture. Press Escape or tap anywhere to close.</Dialog.Description>
          <img src={user.avatarUrl} alt={`${name}'s profile picture`} className="aspect-square w-[min(calc(100vw-2rem),80vh,32rem)] rounded-3xl object-cover shadow-2xl ring-1 ring-border duration-300 animate-in zoom-in-50 fade-in" />
          <Dialog.Close aria-label="Close" className="absolute top-4 right-4 rounded-full bg-card p-2 text-foreground shadow-md transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <X className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
