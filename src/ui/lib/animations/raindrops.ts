/**
 * Raindrops: port of AULA's driver preview 15 (descriptor type 0xf).
 *
 * rain_unit.txt is not in the F75 package, so generator FUN_00486b80 falls back to 23 built-in
 * "units", columns of virtual keys from a full-size ANSI board. Each unit carries one drop: every
 * 40 ms the engine (FUN_0041bbb0, type-0xf branch) lights the drop's next key and darkens the one
 * above it; a drop that has left its column goes idle, and each tick all but two idle columns get
 * random restart picks. Spec: docs/reverse-engineering/previews/raindrops.md.
 */
import { intervalForSpeed, randomDriverColor } from '@/ui/lib/animations/driver'
import type { CreateAnimation, EffectAnimation, Rgb } from '@/ui/lib/animations/types'

/** descriptor[2] = 0x28 (FUN_00486b80). */
const PERIOD_MS = 40
/** LED slots on the board (0x90 records). */
const SLOT_COUNT = 0x90
/** Idle columns the restart loop leaves alone each tick (`local_ec + -2` picks). */
const IDLE_KEPT = 2
/** Colourful mode draws `rand() & 3`: the first four driver colours. */
const COLORFUL_COUNT = 4
/** Marks a virtual key the F75 profile has no key for: the driver's lookup fails and nothing is drawn. */
const NONE = -1

/**
 * FUN_00486b80's built-in units, top to bottom, as LED indices. Each virtual key is mapped through
 * the F75 profile's [KEY] table (VK -> LED), except 0xdc ('\'), which the FR profile puts on the
 * ISO key at LED 75; our US board has '\' at LED 80 instead. Absent keys stay as NONE so a drop
 * still spends a tick on them, as in the driver.
 */
const COLUMNS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5], // Esc ` Tab Caps LShift(a0) LCtrl(a2)
  [0, 1, 2, 3, 76, 11], // Esc ` Tab Caps ISO<>(e2, LED 76, not on US) LWin(5b)
  [7, 8, 9, 10, 17], // 1 Q A Z LAlt(a4)
  [12, 13, 14, 15, 16], // F1 2 W S X
  [18, 19, 20, 21, 22], // F2 3 E D C
  [24, 25, 26, 27, 28], // F3 4 R F V
  [30, 31, 32, 33, 34, 35], // F4 5 T G B Space
  [37, 38, 39, 40], // 6 Y H N
  [36, 43, 44, 45, 46], // F5 7 U J M
  [42, 49, 50, 51, 52, 53], // F6 8 I K , RAlt(a5) = LED 53, our Fn
  [48, 55, 56, 57, 58, 59], // F7 9 O L . Fn(fa) = LED 59, our RCtrl
  [54, 61, 62, 63, 64, NONE], // F8 0 P ; / Apps(5d)
  [60, 67, 68, 69], // F9 - [ '
  [66, 73, 74], // F10 = ]
  [72], // F11
  [78, 79, 80, 81, 70, NONE, NONE], // F12 Backspace \(dc) Enter RShift(a1) ABNT_C1(c1) RCtrl(a3)
  [NONE, NONE, 85, 77], // PrtSc Insert Delete Left
  [NONE, NONE, 88, 82, 83], // ScrollLock Home End Up Down
  [NONE, 86, 87, 89], // Pause PgUp PgDn Right
  [NONE, NONE, NONE, NONE, NONE], // NumLock Num7 Num4 Num1 Num0
  [NONE, NONE, NONE, NONE], // Num/ Num8 Num5 Num2
  [NONE, NONE, NONE, NONE, NONE], // Num* Num9 Num6 Num3 Num.
  [NONE, NONE, NONE], // Num- Num+ (fd)
]

export const createRaindrops: CreateAnimation = (options) => {
  const present = new Set(options.keys.map((k) => k.led))
  // Rain never touches alpha, so every lit key stays at FUN_0041ba70's 200: full strength.
  const color: (Rgb | null)[] = new Array(SLOT_COUNT).fill(null)
  // descriptor[0x4f + 0x24 * i]: the drop's position in its column, -1 when idle.
  const position: number[] = COLUMNS.map(() => -1)

  const randomInt = (n: number) => Math.floor(options.random() * n)

  /** Colourful: a palette colour different from the last one picked this tick. */
  const colorPicker = () => {
    let last: Rgb | null = null
    return (): Rgb => {
      if (options.color) return options.color
      let pick: Rgb
      do pick = randomDriverColor(COLORFUL_COUNT, options.random)
      while (pick === last)
      last = pick
      return pick
    }
  }

  const clear = (led: number) => {
    if (led !== NONE) color[led] = null
  }

  /** Moves one column's drop; returns true when the column is idle. */
  const advance = (column: readonly number[], i: number, nextColor: () => Rgb): boolean => {
    const at = position[i]
    if (at < 0) return true
    if (at >= column.length) {
      // The drop has run off the bottom: darken the last key and go idle.
      clear(column[column.length - 1])
      position[i] = -1
      return false
    }
    const led = column[at]
    if (led !== NONE) color[led] = nextColor()
    if (at > 0) clear(column[at - 1])
    position[i] = at + 1
    return false
  }

  const step = () => {
    const nextColor = colorPicker()
    const idle: number[] = []
    COLUMNS.forEach((column, i) => {
      if (advance(column, i, nextColor)) idle.push(i)
    })
    // Picks are with replacement, so fewer than idle - 2 columns may actually start.
    for (let n = idle.length - IDLE_KEPT; n > 0; n--) position[idle[randomInt(idle.length)]] = 0
  }

  // FUN_0041ba70 runs one frame before arming the timer.
  step()

  const animation: EffectAnimation = {
    interval: intervalForSpeed(PERIOD_MS, options.speed),
    step,
    colors() {
      const out = new Map<number, Rgb>()
      for (let led = 0; led < SLOT_COUNT; led++) {
        const c = color[led]
        if (c && present.has(led)) out.set(led, c)
      }
      return out
    },
  }
  return animation
}
