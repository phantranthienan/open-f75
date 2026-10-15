/**
 * Retro snake: port of AULA's driver preview 5 (descriptor type 5).
 *
 * Generator FUN_00485350 builds a path through the keyboard, row by row, boustrophedon,
 * down the six rows and back up. Every 10 ms the engine (FUN_0041bbb0, type-5 branch) fades
 * every lit key by 8 alpha and lights the next key on the path at alpha 200, so a 25-key
 * tail follows the head round the board. Spec: docs/reverse-engineering/previews/retro-snake.md.
 * (Windows rounds a 10 ms timer up to about 15.6 ms, so the driver's own preview runs
 * about 1.5 times slower than this.)
 */
import { fadingKeys, intervalForSpeed, randomDriverColor, rowsThrough } from '@/ui/lib/animations/driver'
import type { AnimKey, CreateAnimation, Rgb } from '@/ui/lib/animations/types'

/** descriptor[2]: the generator's timer period (FUN_00485350, `unaff_ESI[2] = 10`). */
const PERIOD_MS = 10
/** descriptor[0x107]: alpha of a newly lit key (200; the dispatcher only raises it to 255 when KbDrawType=1). */
const HEAD_ALPHA = 200
/** Alpha every lit key loses per tick (type-5 branch: `*piVar11 + -8`). */
const FADE_PER_TICK = 8
/** LED slots the engine fades (the type-5 loop runs over 0x90 records). */
const SLOT_COUNT = 0x90
/** Colourful mode draws `rand() & 3`: the first four driver colours. */
const COLORFUL_COUNT = 4
/**
 * paoma_unit.txt doesn't ship, so FUN_00485350 builds its path from six rows,
 * each found from one anchor key (VK F1, '1', 'Q', 'A', 'X', Space).
 */
const ROW_ANCHORS = ['F1', '1', 'Q', 'A', 'X', 'Space']

/**
 * FUN_00485350's path: rows top to bottom, alternating direction (the first row
 * left to right), then rows n-2 down to 1 going back up, still alternating, so
 * the path is one continuous snake that ends next to where it starts.
 */
function buildPath(keys: readonly AnimKey[]): number[] {
  const rows = rowsThrough(keys, ROW_ANCHORS)
  const path: number[] = []
  let forward = true
  const walk = (row: readonly AnimKey[]) => {
    for (const key of forward ? row : [...row].reverse()) path.push(key.led)
    forward = !forward
  }
  rows.forEach(walk)
  for (let i = rows.length - 2; i > 0; i--) walk(rows[i])
  return path
}

export const createRetroSnake: CreateAnimation = ({ keys, color, speed, random }) => {
  const path = buildPath(keys)
  const lit = fadingKeys(keys, SLOT_COUNT, FADE_PER_TICK)
  let position = 0 // descriptor[0x103]
  let lastRandom: Rgb | null = null // descriptor[0x106]

  /** Colourful: a driver colour different from the previous head's. */
  const nextColor = (): Rgb => {
    if (color) return color
    let pick: Rgb
    do pick = randomDriverColor(COLORFUL_COUNT, random)
    while (pick === lastRandom)
    lastRandom = pick
    return pick
  }

  const step = () => {
    lit.fade()
    if (path.length === 0) return
    lit.light(path[position], nextColor(), HEAD_ALPHA)
    position = (position + 1) % path.length
  }

  step() // FUN_0041ba70 runs one frame before arming the timer
  return { interval: intervalForSpeed(PERIOD_MS, speed), step, colors: lit.colors }
}
