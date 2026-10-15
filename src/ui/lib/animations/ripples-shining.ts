/**
 * "Ripples shining" (preview 20, descriptor type 0x14): a press starts a diamond-shaped ring that
 * grows from the key across the board. A key lights while the diamond's edge crosses it.
 *
 * Ported from OemDrv.exe (decomp.c line numbers):
 * - FUN_00485860 (88303), the generator: period 15 ms, growth 20 per tick, colour, colourful flag,
 *   six colourful choices, "pressed key" = -1, inactive.
 * - FUN_0041e640 (20110-20115) with FUN_0041e870 (20121), the press handler: puts the diamond's 4
 *   points on the key's edge midpoints (top, left, bottom, right) and marks it active. There is only
 *   one diamond, so a new press restarts the ripple from the new key.
 * - FUN_0041bbb0, type 0x14 branch (18711-18778): each tick, while active, the top and bottom
 *   points move out by 20 and so do the left and right ones. The result is turned into a polygon
 *   region (CreatePolygonRgn). FUN_0041ba00 (17971) counts how many of a rectangle's 4 corners
 *   are in it:
 *   - the client rectangle fully inside means the ripple is done and every key goes dark;
 *   - otherwise each key with 1-3 corners inside is lit and every other key is dark;
 *   - on the first tick, the pressed key also gets the effect colour.
 *
 * Without presses the driver shows nothing. The idle demo at the bottom is our own addition.
 */
import { idleDemo, intervalForSpeed } from '@/ui/lib/animations/driver'
import type { AnimKey, CreateAnimation, Rgb } from '@/ui/lib/animations/types'

/** Timer period in ms (descriptor [2] = 0xf). The preview ignores the speed setting. */
const PERIOD_MS = 15
/** How far each diamond point moves out per tick, in picture units (descriptor [0x13] = 0x14). */
const GROWTH_PER_TICK = 20
/** The colourful choices, descriptor [3..8] (COLORREFs 0xff, 0xffff00, 0xff00, 0xffff, 0xff0000, 0xff00ff). */
const PALETTE: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 255],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
]

/** Not from the driver: the gap between two demo presses, in ms (idleDemo). */
const DEMO_GAP_MS: readonly [number, number] = [150, 600]

interface Point {
  x: number
  y: number
}

/** A RECT as the driver keeps it: left, top, right, bottom. */
interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

const rectOf = (k: AnimKey): Rect => ({ left: k.x, top: k.y, right: k.x + k.w, bottom: k.y + k.h })

/**
 * The client rectangle whose corners end the ripple. Ours is the keys' bounding box, not the
 * preview window. That only shortens a stretch where every key is already dark, so it looks the same.
 */
const boundsOf = (rects: readonly Rect[]): Rect => ({
  left: Math.min(...rects.map((r) => r.left)),
  top: Math.min(...rects.map((r) => r.top)),
  right: Math.max(...rects.map((r) => r.right)),
  bottom: Math.max(...rects.map((r) => r.bottom)),
})

/**
 * PtInRegion on the 4-point polygon, approximated as an exact point-in-convex-quad test that
 * counts the boundary as inside. GDI's rasterised region can differ by a pixel along the edges.
 */
const inQuad = (quad: readonly Point[], p: Point): boolean => {
  let sign = 0
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % quad.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

/** FUN_0041ba00: how many of a rectangle's corners are in the region. */
const cornersInside = (quad: readonly Point[], r: Rect): number =>
  [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.left, y: r.bottom },
    { x: r.right, y: r.bottom },
  ].filter((p) => inQuad(quad, p)).length

export const createRipplesShining: CreateAnimation = (options) => {
  const { keys, color, random } = options
  const interval = intervalForSpeed(PERIOD_MS, options.speed)
  const rects = new Map<number, Rect>(keys.map((k) => [k.led, rectOf(k)]))
  const client = boundsOf([...rects.values()])

  // Descriptor offsets 0x2c..0x48: the diamond's points in the order top, left, bottom, right.
  const top: Point = { x: 0, y: 0 }
  const left: Point = { x: 0, y: 0 }
  const bottom: Point = { x: 0, y: 0 }
  const right: Point = { x: 0, y: 0 }
  const quad = [top, left, bottom, right]
  let active = false // descriptor [0x14] (offset 0x50)
  let pressedLed = -1 // descriptor [0x15] (offset 0x54)
  let lastRandom: Rgb | null = null // descriptor [10] (offset 0x28)

  const ledColor = new Map<number, Rgb>()

  const demo = idleDemo(keys, random, DEMO_GAP_MS)

  /** A palette colour different from the previous pick (the driver's do/while on rand() % 6). */
  const pickRandom = (): Rgb => {
    let c: Rgb
    do c = PALETTE[Math.floor(random() * PALETTE.length)]
    while (c === lastRandom)
    lastRandom = c
    return c
  }

  /**
   * FUN_0041e640 for type 0x14 with FUN_0041e870: the points start on the key's edge midpoints,
   * rounded down. The handler also writes red into the key's record, but nothing repaints before
   * the next tick overwrites it, so the red is never seen and is left out here.
   */
  const trigger = (led: number): void => {
    const r = rects.get(led)
    if (!r) return
    const cx = r.left + Math.trunc((r.right - r.left) / 2)
    const cy = r.top + Math.trunc((r.bottom - r.top) / 2)
    Object.assign(top, { x: cx, y: r.top })
    Object.assign(bottom, { x: cx, y: r.bottom })
    Object.assign(left, { x: r.left, y: cy })
    Object.assign(right, { x: r.right, y: cy })
    active = true
    pressedLed = led
  }

  /** One tick of the 0x14 branch. */
  const grow = (): void => {
    if (!active) return
    top.y -= GROWTH_PER_TICK
    bottom.y += GROWTH_PER_TICK
    left.x -= GROWTH_PER_TICK
    right.x += GROWTH_PER_TICK
    ledColor.clear()
    if (cornersInside(quad, client) === 4) {
      active = false
      return
    }
    for (const [led, r] of rects) {
      const n = cornersInside(quad, r)
      // In colourful mode, every lit key picks a new colour on every tick, so the ring sparkles.
      if (n !== 0 && n !== 4) ledColor.set(led, color ?? pickRandom())
    }
    if (pressedLed !== -1) {
      // The driver uses the descriptor colour here, even in colourful mode, where it is whatever
      // the colour picker holds. We have no colour in that mode, so we pick one (a guess).
      ledColor.set(pressedLed, color ?? pickRandom())
      pressedLed = -1
    }
  }

  return {
    interval,
    step() {
      demo.tick(interval, trigger, active) // a demo press waits for the ring to finish
      grow()
    },
    press(led: number) {
      demo.pressed()
      trigger(led)
    },
    colors() {
      return new Map(ledColor)
    },
  }
}
