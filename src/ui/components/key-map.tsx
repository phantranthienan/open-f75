import { memo, type KeyboardEvent, type PointerEvent } from 'react'
import { parseHexColor } from '@/protocol/bytes'
import { F75_KEYS, KEYS_VIEW_BOX, KNOB, type Key } from '@/protocol/keys'
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

/** One key's shape and label, in its colour (muted when off). */
function KeyShape({ k, hex }: { k: Key; hex: string | undefined }) {
  return (
    <>
      <rect
        x={k.x}
        y={k.y}
        width={k.w}
        height={k.h}
        rx={3}
        className="shape"
        fill={hex ?? 'var(--muted)'}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <text
        x={k.x + k.w / 2}
        y={k.y + k.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fill={hex ? labelColor(hex) : 'var(--muted-foreground)'}
        className="pointer-events-none"
      >
        {k.label}
      </text>
    </>
  )
}

/** The knob above Delete: drawn so the map looks like the board, but it has no light, so it never takes a colour. */
function Knob() {
  return (
    <g aria-hidden="true">
      <circle cx={KNOB.x} cy={KNOB.y} r={KNOB.r} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <circle cx={KNOB.x} cy={KNOB.y} r={KNOB.r - 4} fill="none" stroke="var(--border)" strokeWidth={1} />
      <line x1={KNOB.x} y1={KNOB.y - KNOB.r + 4} x2={KNOB.x} y2={KNOB.y - KNOB.r + 9} stroke="var(--muted-foreground)" strokeWidth={1.5} />
    </g>
  )
}

/** A key you can paint. Memoised: while painting, only the key whose colour changed renders again. */
const KeyCap = memo(function KeyCap({ k, hex, onPaint }: { k: Key; hex: string | undefined; onPaint: (key: Key) => void }) {
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
      <KeyShape k={k} hex={hex} />
    </g>
  )
})

/**
 * The F75 in its US layout (keys.ts), one shape per key in its colour, and the knob.
 * With `onPaint`, click a key to paint it, or press and drag across keys;
 * Enter or Space paints the focused key. Without it, the map is a picture
 * named by `label` (the effect preview), and `onPress`, if given, hears clicks
 * on its keys.
 */
export function KeyMap({
  colors,
  onPaint,
  onPress,
  label,
  className,
}: {
  colors: KeyHexColors
  onPaint?: (key: Key) => void
  onPress?: (key: Key) => void
  label?: string
  className?: string
}) {
  if (!onPaint) {
    return (
      <svg viewBox={KEYS_VIEW_BOX} role="img" aria-label={label} className={cn('select-none', onPress && 'cursor-pointer', className)}>
        {F75_KEYS.map((k) => (
          <g key={k.led} data-key={k.name} onPointerDown={onPress && (() => onPress(k))}>
            <KeyShape k={k} hex={colors.get(k.led)} />
          </g>
        ))}
        <Knob />
      </svg>
    )
  }
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
      <Knob />
    </svg>
  )
}
