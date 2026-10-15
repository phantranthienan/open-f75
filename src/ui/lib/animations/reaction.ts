/**
 * "Reaction" (preview 17, descriptor type 0x11): a pressed key lights up and fades out.
 *
 * Ported from OemDrv.exe (decomp.c line numbers):
 * - FUN_00485720 (88219), the generator: period 50 ms, colour, colourful flag, press alpha 220,
 *   fade step 40, then 144 colour slots and 144 alpha slots indexed by LED.
 * - FUN_0041e640 (20059-20078), the press handler: sets the key's alpha slot to 220 and its colour
 *   slot to the effect colour, or to a random one of six in colourful mode.
 * - FUN_0041bbb0, type 0x11 branch (18541, body 19721-19741): each tick, every non-zero alpha slot drops by
 *   40 (anything below 1 becomes 0) and is copied with its colour to the key's record. The record
 *   alpha is the fill alpha the preview paints the key with.
 *
 * Without presses the driver shows nothing. The idle demo at the bottom is our own addition.
 */
import { idleDemo, intervalForSpeed, withAlpha } from '@/ui/lib/animations/driver'
import type { AnimKey, CreateAnimation, Rgb } from '@/ui/lib/animations/types'

/** Timer period in ms (descriptor [2] = 0x32). The preview ignores the speed setting. */
const PERIOD_MS = 50
/** Alpha a key's slot is set to on a press (descriptor [5] = 0xdc). */
const PRESS_ALPHA = 220
/** Alpha lost per tick (descriptor [6] = 0x28): 220 shows as 180, 140, 100, 60, 20, then off. */
const FADE_STEP = 40
/** FUN_0041e640's colourful choices, in its order (COLORREFs 0xff, 0xffff00, 0xff00, 0xffff, 0xff0000, 0xff00ff). */
const PRESS_PALETTE: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 255],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
]
/**
 * The press handler reseeds rand() with time(NULL), which counts whole seconds, and takes the
 * first number. So every press within the same second gets the same colourful colour.
 */
const SEED_PERIOD_MS = 1000

/** Not from the driver: the gap between two demo presses, in ms (idleDemo). */
const DEMO_GAP_MS: readonly [number, number] = [120, 420]

export const createReaction: CreateAnimation = (options) => {
  const { keys, color, random } = options
  const interval = intervalForSpeed(PERIOD_MS, options.speed)
  const known = new Set(keys.map((k: AnimKey) => k.led))

  // The descriptor's per-LED slots (what a press writes)...
  const slotColor = new Map<number, Rgb>()
  const slotAlpha = new Map<number, number>()
  // ...and the LED records the engine copies them into (what is painted).
  const shownColor = new Map<number, Rgb>()
  const shownAlpha = new Map<number, number>()

  let elapsedMs = 0
  let seedSecond = -1
  let secondColor: Rgb = PRESS_PALETTE[0]
  const demo = idleDemo(keys, random, DEMO_GAP_MS)

  const colorfulColor = (): Rgb => {
    const second = Math.floor(elapsedMs / SEED_PERIOD_MS)
    if (second !== seedSecond) {
      seedSecond = second
      secondColor = PRESS_PALETTE[Math.floor(random() * PRESS_PALETTE.length)]
    }
    return secondColor
  }

  /** FUN_0041e640 for type 0x11. The record is only updated on the next tick. */
  const trigger = (led: number): void => {
    if (!known.has(led)) return
    slotAlpha.set(led, PRESS_ALPHA)
    slotColor.set(led, color ?? colorfulColor())
  }

  /** The engine's type 0x11 branch: fade every lit slot and copy it to the record. */
  const fade = (): void => {
    for (const [led, alpha] of slotAlpha) {
      if (alpha === 0) continue
      const next = alpha - FADE_STEP < 1 ? 0 : alpha - FADE_STEP
      slotAlpha.set(led, next)
      shownColor.set(led, slotColor.get(led) ?? [0, 0, 0])
      shownAlpha.set(led, next)
    }
  }

  return {
    interval,
    step() {
      elapsedMs += interval
      demo.tick(interval, trigger)
      fade()
    },
    press(led: number) {
      demo.pressed()
      trigger(led)
    },
    colors() {
      const out = new Map<number, Rgb>()
      for (const [led, alpha] of shownAlpha) {
        const c = shownColor.get(led)
        if (alpha > 0 && c) out.set(led, withAlpha(c, alpha))
      }
      return out
    },
  }
}
