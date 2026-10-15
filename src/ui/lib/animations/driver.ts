/**
 * Pieces of AULA's preview engine that several effects share. decomp.c line
 * numbers and OemDrv.exe addresses are given where they matter; each effect's
 * spec is in docs/reverse-engineering/previews/.
 */
import type { AnimKey, Rgb } from '@/ui/lib/animations/types'

/** A colour as the driver stores it: COLORREF 0x00BBGGRR, so 0x0000ff is red. */
export type ColorRef = number

export const colorRefToRgb = (c: ColorRef): Rgb => [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff]

/**
 * The previews ignore the speed setting: each period is a constant of its
 * generator. So the driver's period stands for speed 2 and each step scales it
 * by √2, speed 4 being fastest. Only the tick interval changes, never a frame.
 */
export function intervalForSpeed(periodMs: number, speed: number): number {
  const s = Math.min(4, Math.max(0, Math.round(speed)))
  return periodMs * 2 ** ((2 - s) / 2)
}

/**
 * The preview paints each key as a fill of some alpha over the dark key
 * picture. FUN_0041ba70 gives every key 200 (0xc8) on the F75, whose profile
 * has KbDrawType=0: that is how an effect that is simply on looks, so 200 shows
 * as full strength here, and the 220 a press gets is capped at it.
 */
export const FULL_ALPHA = 200

export function withAlpha([r, g, b]: Rgb, alpha: number): Rgb {
  const k = Math.max(0, Math.min(1, alpha / FULL_ALPHA))
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k)]
}

/**
 * DAT_00652488: red, green, blue, magenta, cyan, yellow. The colourful
 * generators draw from the start of it, each from its own count.
 */
export const DRIVER_COLORS: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 0],
]

/** One of the first `count` driver colours, at random. */
export const randomDriverColor = (count: number, random: () => number): Rgb =>
  DRIVER_COLORS[Math.floor(random() * count)]

/**
 * FUN_0040e4d0 (decomp.c 10217): step `pos` of `steps` from `from` toward `to`.
 * Per channel: from + pos * float32((to - from) / steps), truncated, since the
 * FPU is switched to chop mode (`or eax,0xc00` at 0x40e52b). The float32
 * matters: 280 * float32(255 / 1400) is 50.99999, so the driver shows 50.
 */
export function fade(from: Rgb, to: Rgb, steps: number, pos: number): Rgb {
  const channel = (i: number) => Math.trunc(from[i] + pos * Math.fround((to[i] - from[i]) / steps))
  return [channel(0), channel(1), channel(2)]
}

/** FUN_00484f90: a colour scaled to tenths, each channel truncated. */
export const tenths = ([r, g, b]: Rgb, n: number): Rgb => [Math.trunc((r * n) / 10), Math.trunc((g * n) / 10), Math.trunc((b * n) / 10)]

/**
 * FUN_0041e4f0 (decomp.c 19936): the row through an anchor key is every key
 * whose rectangle spans the anchor's vertical centre, left to right. Effects
 * that run along rows find them from one anchor key per row; an anchor the
 * board lacks gives no row.
 */
export function rowsThrough(keys: readonly AnimKey[], anchors: readonly string[]): AnimKey[][] {
  return anchors.flatMap((name) => {
    const anchor = keys.find((k) => k.name === name)
    if (!anchor || anchor.w <= 0) return []
    const centre = anchor.y + Math.trunc(anchor.h / 2)
    const row = keys.filter((k) => k.y <= centre && centre <= k.y + k.h).sort((a, b) => a.x - b.x)
    return row.length > 0 ? [row] : []
  })
}

/**
 * The LED records of the effects that light keys and let them fade (Retro
 * snake, Sine wave, Stars twinkle): a colour and an alpha per LED slot, every
 * lit slot losing `fadeStep` alpha a tick until it goes dark.
 */
export function fadingKeys(keys: readonly AnimKey[], slots: number, fadeStep: number) {
  const present = new Set(keys.map((k) => k.led))
  const color: (Rgb | null)[] = new Array(slots).fill(null)
  const alpha: number[] = new Array(slots).fill(FULL_ALPHA)
  return {
    fade() {
      for (let i = 0; i < slots; i++) {
        if (alpha[i] <= 0) continue
        alpha[i] -= fadeStep
        if (alpha[i] <= 0) color[i] = null
      }
    },
    light(slot: number, rgb: Rgb, a: number) {
      color[slot] = rgb
      alpha[slot] = a
    },
    isDark: (slot: number) => color[slot] === null,
    colors(): ReadonlyMap<number, Rgb> {
      const out = new Map<number, Rgb>()
      color.forEach((rgb, led) => {
        if (rgb && alpha[led] > 0 && present.has(led)) out.set(led, withAlpha(rgb, alpha[led]))
      })
      return out
    },
  }
}

/** Not from the driver: how long without a real press before the reactive previews press keys by themselves. */
const DEMO_IDLE_MS = 2000

/**
 * Not from the driver. AULA ships these previews switched off
 * (`ReactionEffect=0` in Cfg.ini) and never makes up presses, so its preview
 * of a reactive effect stays dark. Ours presses a random key every
 * `gapMs[0]..gapMs[1]` ms after DEMO_IDLE_MS without a real press, so the
 * preview always shows what the effect does.
 */
export function idleDemo(keys: readonly AnimKey[], random: () => number, gapMs: readonly [number, number]) {
  let sinceRealPress = Number.POSITIVE_INFINITY
  let untilNext = 0
  return {
    pressed() {
      sinceRealPress = 0
    },
    /** Advances by one tick and presses a key through `press` when one is due. `busy` holds it back (a ripple still growing). */
    tick(ms: number, press: (led: number) => void, busy = false): void {
      sinceRealPress += ms
      if (busy || sinceRealPress < DEMO_IDLE_MS || keys.length === 0) return
      untilNext -= ms
      if (untilNext > 0) return
      press(keys[Math.floor(random() * keys.length)].led)
      untilNext = gapMs[0] + random() * (gapMs[1] - gapMs[0])
    },
  }
}

/** One line of a Cartoon\*_unit.txt file: keys (as F75 LED indices) that share a colour. */
export interface KeyUnit {
  readonly leds: readonly number[]
  /** The line's `:r,g,b`, if it has one. */
  readonly color?: Rgb
}

/**
 * The six colours the colourful Fixed on and Breathing generators fill keys
 * with (FUN_00485000 at 0x48503e, FUN_004850e0 at 0x485158): red, green, blue,
 * magenta, yellow, white.
 */
const FILL_COLORS: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [255, 255, 0],
  [255, 255, 255],
]

/**
 * The colourful generators' per-key fill: rand() % 6, drawn again while it
 * equals the previous key's colour, so neighbours in key order always differ.
 * On the F75 a unit file then repaints every key, so this order never shows.
 */
export function randomKeyColors(keys: readonly AnimKey[], random: () => number): Map<number, Rgb> {
  const colors = new Map<number, Rgb>()
  let previous: Rgb | null = null
  for (const key of keys) {
    let pick: Rgb
    do pick = FILL_COLORS[Math.floor(random() * FILL_COLORS.length)]
    while (pick === previous)
    colors.set(key.led, pick)
    previous = pick
  }
  return colors
}

const BLACK: Rgb = [0, 0, 0]

/**
 * FUN_00432640's interpolation (decomp.c 32104-32140): each uncoloured unit
 * takes a colour between the coloured units around it, fading from one to the
 * next over the units between them. After the last coloured unit the previous
 * end colour is reused; the shipped files all colour their last unit.
 */
function unitColors(units: readonly KeyUnit[]): Rgb[] {
  const given = units.map((unit) => unit.color ?? null)
  const result: Rgb[] = []
  let end: Rgb = BLACK
  for (let start = 0; start < units.length; ) {
    const from = given[start] ?? BLACK
    let span = 1
    while (start + span < units.length && given[start + span] === null) span++
    if (start + span < units.length) end = given[start + span]!
    for (let k = 0; k < span; k++) result.push(fade(from, end, span, k))
    start += span
  }
  return result
}

/**
 * FUN_00432640 as the dispatcher calls it for colourful Fixed on and
 * Breathing: paints the units' colours over the generator's per-key colours,
 * in file order, so a key listed twice keeps the later unit's colour.
 */
export function applyUnits(colors: Map<number, Rgb>, units: readonly KeyUnit[], keys: readonly AnimKey[]): void {
  // The driver first zeroes as many per-key slots as there are coloured units
  // (memset at 0x4327b2, decomp.c 32098), from the first key in profile order.
  // Probably meant to clear the whole array; on the F75 those keys are repainted.
  const coloured = units.filter((unit) => unit.color !== undefined).length
  for (const key of keys.slice(0, coloured)) colors.delete(key.led)

  const present = new Set(keys.map((key) => key.led))
  unitColors(units).forEach((color, i) => {
    for (const led of units[i].leds) if (present.has(led)) colors.set(led, color)
  })
}
