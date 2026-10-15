/**
 * "Flash away" (preview 19, descriptor type 0x13): a press sends two flashes along the key's row,
 * one to the left and one to the right, one key per tick. Each key they cross fades out behind them.
 *
 * Ported from OemDrv.exe (decomp.c line numbers):
 * - FUN_00488820 (90062), the generator: period 30 ms, colour, colourful flag, flash alpha 220,
 *   fade step 45, and 10 empty wave slots. It builds up to 6 rows with FUN_0041e4f0 (19936), each
 *   the keys level with a seed key (F1, 1, Q, A, X, Space) sorted left to right. The dispatcher calls
 *   it with a third argument of 0 (31937), so the column table that type 0x1a also uses (a vertical
 *   wave) stays empty, and Flash away runs along rows only.
 * - FUN_0041e640 (20083-20109), the press handler: claims the first free slot with the key's row
 *   and its position in that row (FUN_004887a0, 89990).
 * - FUN_0041bbb0, type 0x13 branch (18585-18708): each tick, every active slot lights the key at
 *   its left counter and the key at its right counter (alpha 220), then moves the left counter
 *   down and the right counter up. After that, every lit key loses 45 alpha and goes off below 0.
 *
 * Without presses the driver shows nothing. The idle demo at the bottom is our own addition.
 */
import { idleDemo, intervalForSpeed, randomDriverColor, rowsThrough, withAlpha } from '@/ui/lib/animations/driver'
import type { CreateAnimation, Rgb } from '@/ui/lib/animations/types'

/** Timer period in ms (descriptor [2] = 0x1e). The preview ignores the speed setting. */
const PERIOD_MS = 30
/** Alpha a key gets when a flash reaches it (descriptor [0x101e] = 0xdc). */
const FLASH_ALPHA = 220
/** Alpha lost per tick by every lit key (descriptor [0x101f] = 0x2d): 175, 130, 85, 40, off. */
const FADE_STEP = 45
/** Wave slots in the descriptor (offset 0x3f7c, 6 ints each). A press with all of them busy is dropped. */
const MAX_WAVES = 10
/** The seed key of each row, in FUN_00488820's order (VK 0x70, '1', 'Q', 'A', 'X', 0x20). */
const ROW_SEEDS = ['F1', '1', 'Q', 'A', 'X', 'Space']
/** Colourful mode draws `rand() % 6`: all six driver colours. */
const COLORFUL_COUNT = 6

/** Not from the driver: the gap between two demo presses, in ms (idleDemo). */
const DEMO_GAP_MS: readonly [number, number] = [300, 900]

/** One wave slot: [0] row, [1] left counter, [2] right counter. -1 is a finished direction. */
interface Wave {
  row: number
  left: number
  right: number
}

export const createFlashAway: CreateAnimation = (options) => {
  const { keys, color, random } = options
  const interval = intervalForSpeed(PERIOD_MS, options.speed)
  const rows = rowsThrough(keys, ROW_SEEDS).map((row) => row.map((k) => k.led))
  const waves: Wave[] = Array.from({ length: MAX_WAVES }, () => ({ row: 0, left: -1, right: -1 }))

  // The LED records: colour (0 = off) and alpha.
  const ledColor = new Map<number, Rgb>()
  const ledAlpha = new Map<number, number>()

  let lastRandom: Rgb | null = null // descriptor [0x101c]
  const demo = idleDemo(keys, random, DEMO_GAP_MS)

  /** A palette colour different from the previous pick (the driver's do/while on rand() % 6). */
  const pickRandom = (): Rgb => {
    let c: Rgb
    do c = randomDriverColor(COLORFUL_COUNT, random)
    while (c === lastRandom)
    lastRandom = c
    return c
  }

  /** FUN_004887a0: the first row containing the LED, and its position in that row. */
  const findInRows = (led: number): { row: number; pos: number } | null => {
    for (let row = 0; row < rows.length; row++) {
      const pos = rows[row].indexOf(led)
      if (pos >= 0) return { row, pos }
    }
    return null
  }

  /** FUN_0041e640 for type 0x13. A slot is free once both of its row counters are finished. */
  const trigger = (led: number): void => {
    const found = findInRows(led)
    const wave = waves.find((w) => w.left < 0 && w.right < 0)
    if (!found || !wave) return
    wave.row = found.row
    wave.left = found.pos
    wave.right = found.pos
  }

  const light = (led: number, c: Rgb): void => {
    ledColor.set(led, c)
    ledAlpha.set(led, FLASH_ALPHA)
  }

  /**
   * One tick of the 0x13 branch. In colourful mode the left flash picks a new colour each tick and
   * remembers it for the tick (local_ec). A right flash reuses the latest left pick of the tick, if
   * any, so the two flashes of a press share a colour that changes at every key.
   */
  const advanceWaves = (): void => {
    let tickPick: Rgb | null = null
    for (const wave of waves) {
      const row = rows[wave.row]
      if (wave.left >= 0) {
        let c = color
        if (!c) {
          c = pickRandom()
          tickPick = c
        }
        light(row[wave.left], c)
        wave.left--
      }
      if (wave.right >= 0) {
        light(row[wave.right], color ?? tickPick ?? pickRandom())
        wave.right++
        if (wave.right >= row.length) wave.right = -1
      }
    }
  }

  /** The end of the 0x13 branch: every lit key fades, and goes off once its alpha drops below 0. */
  const fadeAll = (): void => {
    for (const [led, alpha] of ledAlpha) {
      if (alpha === 0 || !ledColor.has(led)) continue
      const next = alpha - FADE_STEP
      if (next < 0) {
        ledColor.delete(led)
        ledAlpha.delete(led)
      } else {
        ledAlpha.set(led, next)
      }
    }
  }

  return {
    interval,
    step() {
      demo.tick(interval, trigger)
      advanceWaves()
      fadeAll()
    },
    press(led: number) {
      demo.pressed()
      trigger(led)
    },
    colors() {
      const out = new Map<number, Rgb>()
      for (const [led, c] of ledColor) {
        const alpha = ledAlpha.get(led) ?? 0
        if (alpha > 0) out.set(led, withAlpha(c, alpha))
      }
      return out
    },
  }
}
