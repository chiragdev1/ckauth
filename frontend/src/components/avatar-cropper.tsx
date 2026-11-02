import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { Dialog } from 'radix-ui'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'

// the square sent to the api: big enough for the full-size viewer on a retina phone, and as a jpeg always far under 2 MB
const OUTPUT_SIZE = 512
const MAX_ZOOM = 4
const ARROW_STEP = 10

type Crop = { zoom: number, x: number, y: number }

// pick the square of the photo that becomes the avatar. drag (or arrow keys) to move it, slider or wheel to zoom.
// the crop is made in the browser, so a 12 MB phone photo uploads as a ~60 KB square
export function AvatarCropper({ file, onCancel, onCropped }: { file: File, onCancel: () => void, onCropped: (blob: Blob) => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [frameSize, setFrameSize] = useState(0)
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ startX: number, startY: number, x: number, y: number } | null>(null)

  useEffect(() => {
    // revoking the url in cleanup makes a still-loading image fail, so a run that was cleaned up (a new file, or react's
    // strict mode running effects twice in development) must ignore its own load and error events
    let current = true
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { if(current) setImage(img) }
    // e.g. a HEIC photo the browser can't decode, though it claimed an image type
    img.onerror = () => { if(current) setFailed(true) }
    img.src = url
    return () => {
      current = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  // the frame's real size in css pixels, so dragging maps one-to-one at any screen width
  useEffect(() => {
    if(!frame.current) return
    const observer = new ResizeObserver(([entry]) => setFrameSize(entry!.contentRect.width))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [image])

  // zoom 1 = the photo just covers the square; scale converts photo pixels to frame pixels
  const scale = image && frameSize ? frameSize / Math.min(image.naturalWidth, image.naturalHeight) * crop.zoom : 0
  const width = image ? image.naturalWidth * scale : 0
  const height = image ? image.naturalHeight * scale : 0

  // keeps the photo covering the whole square: no empty edge can be moved into view
  function clamp(next: Crop): Crop {
    if(!image || !frameSize) return next
    const nextScale = frameSize / Math.min(image.naturalWidth, image.naturalHeight) * next.zoom
    const w = image.naturalWidth * nextScale
    const h = image.naturalHeight * nextScale
    return { zoom: next.zoom, x: Math.min(0, Math.max(frameSize - w, next.x)), y: Math.min(0, Math.max(frameSize - h, next.y)) }
  }

  // centred to start with, once the photo and the frame are both measured
  useEffect(() => {
    if(!image || !frameSize) return
    const s = frameSize / Math.min(image.naturalWidth, image.naturalHeight)
    setCrop({ zoom: 1, x: (frameSize - image.naturalWidth * s) / 2, y: (frameSize - image.naturalHeight * s) / 2 })
  }, [image, frameSize])

  // zooms around the centre of the square, so what's in the middle stays in the middle
  function zoomTo(zoom: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom))
    setCrop(current => {
      const ratio = next / current.zoom
      const centre = frameSize / 2
      return clamp({ zoom: next, x: centre - (centre - current.x) * ratio, y: centre - (centre - current.y) * ratio })
    })
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startY: event.clientY, x: crop.x, y: crop.y }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if(!drag.current) return
    const start = drag.current
    setCrop(current => clamp({ ...current, x: start.x + event.clientX - start.startX, y: start.y + event.clientY - start.startY }))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [ARROW_STEP, 0], ArrowRight: [-ARROW_STEP, 0], ArrowUp: [0, ARROW_STEP], ArrowDown: [0, -ARROW_STEP] }
    const move = moves[event.key]
    if(move) {
      event.preventDefault()
      setCrop(current => clamp({ ...current, x: current.x + move[0], y: current.y + move[1] }))
    }
    if(event.key === '+' || event.key === '=') zoomTo(crop.zoom + 0.2)
    if(event.key === '-') zoomTo(crop.zoom - 0.2)
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    zoomTo(crop.zoom - event.deltaY * 0.002)
  }

  // draws exactly the part inside the square, at OUTPUT_SIZE, onto a white background (jpeg has no transparency)
  function handleSave() {
    if(!image || !scale) return
    setSaving(true)
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, -crop.x / scale, -crop.y / scale, frameSize / scale, frameSize / scale, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    canvas.toBlob(blob => {
      setSaving(false)
      if(blob) onCropped(blob)
      else setFailed(true)
    }, 'image/jpeg', 0.9)
  }

  return (
    <Dialog.Root open onOpenChange={open => { if(!open && !saving) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl focus:outline-none">
          <div>
            <Dialog.Title className="font-display text-lg font-semibold">Position your photo</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">Drag to move it, and zoom to fit. Arrow keys work too.</Dialog.Description>
          </div>
          {failed ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">This photo can't be opened here. Try a JPEG, PNG or WebP.</p>
          ) : (
            <div
              ref={frame}
              tabIndex={0}
              role="img"
              aria-label="Photo crop area. Use the arrow keys to move the photo, plus and minus to zoom."
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => { drag.current = null }}
              onKeyDown={handleKeyDown}
              onWheel={handleWheel}
              className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-xl bg-secondary select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
            >
              {image && scale > 0 && (
                <img src={image.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ width, height, left: crop.x, top: crop.y }} />
              )}
              {/* a round mask, since the avatar shows as a circle almost everywhere; the corners outside it are still saved
                  (the full-size viewer shows the whole square), so they're dimmed rather than hidden */}
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.55)]" />
            </div>
          )}
          {!failed && (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon-sm" onClick={() => zoomTo(crop.zoom - 0.25)} aria-label="Zoom out" disabled={!image}><Minus /></Button>
              <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} onChange={event => zoomTo(Number(event.target.value))} aria-label="Zoom" className="flex-1 accent-primary" disabled={!image} />
              <Button variant="ghost" size="icon-sm" onClick={() => zoomTo(crop.zoom + 0.25)} aria-label="Zoom in" disabled={!image}><Plus /></Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!image || failed || saving}>{saving ? 'Saving…' : 'Use this photo'}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
