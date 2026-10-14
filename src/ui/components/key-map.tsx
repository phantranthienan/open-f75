import type { KeyboardEvent, PointerEvent } from 'react'
import { parseHexColor } from '@/protocol/bytes'
import { F75_KEYS, KEYS_VIEW_BOX, type Key } from '@/protocol/keys'
import type { KeyHexColors } from '@/ui/hooks/use-key-colors'
import { cn } from '@/ui/lib/utils'

/** Dark text on light key colours, light text on dark ones (WCAG relative luminance). */
function labelColor(hex: string): string {
  const linear = parseHexColor(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return luminance > 0.25 ? '#11111b' : '#ffffff'
}

function KeyCap({ k, hex, onPaint }: { k: Key; hex: string | undefined; onPaint: (key: Key) => void }) {
  const onPointerDown = (e: PointerEvent<SVGGElement>) => {
    // Touch captures the pointer to the first key; release it so a drag reaches the others.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    onPaint(k)
  }
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onPaint(k)
  }
  const shape = { className: 'shape', fill: hex ?? 'var(--muted)', stroke: 'var(--border)', strokeWidth: 1 }
  // ISO Enter: centre the label in its upper, wider part.
  const [cx, cy] = k.outline ? [k.x + k.w / 2, k.y + 15] : [k.x + k.w / 2, k.y + k.h / 2]

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${k.name}: ${hex ?? 'off'}`}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => {
        if (e.buttons & 1) onPaint(k) // dragging with the button held
      }}
      onKeyDown={onKeyDown}
      className="cursor-pointer outline-none [&:focus-visible>.shape]:stroke-ring [&:focus-visible>.shape]:stroke-2"
    >
      <title>{`${k.name}: ${hex ?? 'off'}`}</title>
      {k.outline ? <polygon points={k.outline} {...shape} /> : <rect x={k.x} y={k.y} width={k.w} height={k.h} rx={3} {...shape} />}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fill={hex ? labelColor(hex) : 'var(--muted-foreground)'}
        className="pointer-events-none"
      >
        {k.label}
      </text>
    </g>
  )
}

/**
 * The F75 as AULA's driver draws it, one shape per key in its stored colour.
 * Click a key to paint it, or press and drag across keys; Enter or Space
 * paints the focused key.
 */
export function KeyMap({ colors, onPaint, className }: { colors: KeyHexColors; onPaint: (key: Key) => void; className?: string }) {
  return (
    <svg
      viewBox={KEYS_VIEW_BOX}
      role="group"
      aria-label="F75 keys"
      className={cn('touch-none select-none', className)}
    >
      {F75_KEYS.map((k) => (
        <KeyCap key={k.led} k={k} hex={colors.get(k.led)} onPaint={onPaint} />
      ))}
    </svg>
  )
}
