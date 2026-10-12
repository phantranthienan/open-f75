import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { hsvToRgb, rgbToHsv } from '@/ui/lib/color'

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Hue around the ring (red at the top, clockwise), saturation from the centre
 * (white) to the edge, always at full value: the board has its own brightness,
 * and dark colours only make the LEDs look off.
 */
export function ColorWheel({ value, onChange, size = 168 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const { h, s } = rgbToHsv(parseHexColor(value))
  const r = size / 2
  const emit = (hue: number, sat: number) => onChange(formatHexColor(hsvToRgb({ h: (hue + 360) % 360, s: clamp(sat), v: 1 })))

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - box.left - r
    const dy = e.clientY - box.top - r
    emit((Math.atan2(dx, -dy) * 180) / Math.PI, Math.hypot(dx, dy) / r)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 3 : 1
    const moves: Record<string, () => void> = {
      ArrowRight: () => emit(h + 5 * big, s),
      ArrowLeft: () => emit(h - 5 * big, s),
      ArrowUp: () => emit(h, s + 0.05 * big),
      ArrowDown: () => emit(h, s - 0.05 * big),
      Home: () => emit(0, 0),
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      move()
    }
  }

  const rad = (h * Math.PI) / 180
  return (
    <div
      ref={ref}
      className="relative shrink-0 touch-none rounded-full ring-1 ring-border select-none"
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(circle closest-side, #fff, transparent), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
        ref.current?.querySelector<HTMLElement>('[role="slider"]')?.focus()
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
      }}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Colour wheel"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(h)}
        aria-valuetext={`hue ${Math.round(h)}°, saturation ${Math.round(s * 100)}%, ${value}`}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
        onKeyDown={onKeyDown}
        className="absolute size-4 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#0f172a] outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        style={{ left: r + r * s * Math.sin(rad), top: r - r * s * Math.cos(rad), backgroundColor: value }}
      />
    </div>
  )
}
