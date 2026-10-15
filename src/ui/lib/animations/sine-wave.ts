/**
 * Sine wave: port of AULA's driver preview 12 (descriptor type 0xc).
 *
 * Generator FUN_00488750 only stores the colour, the colourful flag and a 30 ms period. The
 * engine (FUN_0041bbb0, type-0xc branch) samples y = centre + A * sin(phase + t) at t = 0, 8, ...
 * 360 degrees across the board's width, lights every dark key a sample lands on, fades all keys
 * by 50 alpha per tick and moves the phase back 20 degrees, so the wave travels left to right.
 * Spec: docs/reverse-engineering/previews/sine-wave.md.
 */
import { fadingKeys, intervalForSpeed, randomDriverColor } from '@/ui/lib/animations/driver'
import type { AnimKey, CreateAnimation } from '@/ui/lib/animations/types'

/** descriptor[2]: the dispatcher passes 0x1e = 30 ms to FUN_00488750. */
const PERIOD_MS = 30
/** descriptor[7]: alpha of a newly lit key (200; 255 only with KbDrawType=1). */
const LIT_ALPHA = 200
/** Alpha every lit key loses per tick (`*piVar11 + -0x32`). */
const FADE_PER_TICK = 50
/** LED slots the engine fades (records below the LED count, 0x90 on the F75). */
const SLOT_COUNT = 0x90
/** Degrees between samples (`local_e0 + 8.0`). */
const SAMPLE_STEP_DEG = 8
/** Degrees the phase moves back each tick (`in_EDX[10] + -0x14`); it restarts at 360 once negative. */
const PHASE_STEP_DEG = 20
const PHASE_START_DEG = 360
/** First sample sits 5 units right of the leftmost key (`left + 5.0`). */
const X_MARGIN = 5
/** The amplitude is half the board's height less 10 units (`h * 0.5 - 10.0`). */
const AMPLITUDE_MARGIN = 10
/** Boards with more than 90 keys get a 450-degree sweep (FUN_0041e2e0 counts keys). */
const LARGE_BOARD_KEYS = 90
/** The driver's degree-to-radian constant (0x626f58). */
const DEG_TO_RAD = 0.0174532925
/** Colourful mode draws `rand() % 6`: all six driver colours. */
const COLORFUL_COUNT = 6

const f32 = Math.fround

interface Wave {
  originX: number // descriptor[0xb]
  centreY: number // descriptor[0xc]
  amplitude: number // descriptor[9]
  sweep: number // descriptor[0xd]
  xStep: number // descriptor[0xe], units per degree (a float)
}

/** The engine's first-tick set-up, from the keys' bounding box (FUN_0041e330). */
function measure(keys: readonly AnimKey[]): Wave {
  const drawn = keys.filter((k) => k.w > 0)
  const left = Math.min(...drawn.map((k) => k.x))
  const top = Math.min(...drawn.map((k) => k.y))
  const width = Math.max(...drawn.map((k) => k.x + k.w)) - left
  const height = Math.max(...drawn.map((k) => k.y + k.h)) - top
  const sweep = keys.length > LARGE_BOARD_KEYS ? 450 : 360
  return {
    originX: Math.trunc(left + X_MARGIN),
    centreY: Math.trunc(top + height * 0.5),
    amplitude: Math.trunc(height * 0.5 - AMPLITUDE_MARGIN),
    sweep,
    xStep: f32(width / sweep),
  }
}

/**
 * FUN_0041e430: the first key (in LED order) whose rectangle holds the point, right and bottom
 * edges excluded. The space bar only counts in a box as wide as the first key, centred on it.
 */
function keyFinder(keys: readonly AnimKey[]): (x: number, y: number) => number {
  const ordered = [...keys].sort((a, b) => a.led - b.led)
  const firstWidth = ordered.length > 0 ? ordered[0].w : 0
  const boxes = ordered.map((k) => {
    if (k.name !== 'Space') return { led: k.led, left: k.x, right: k.x + k.w, top: k.y, bottom: k.y + k.h }
    const left = k.x + Math.trunc((k.w - firstWidth) / 2)
    return { led: k.led, left, right: left + firstWidth, top: k.y, bottom: k.y + k.h }
  })
  return (x, y) => {
    const box = boxes.find((b) => b.left <= x && x < b.right && b.top <= y && y < b.bottom)
    return box ? box.led : -1
  }
}

/** One sample, with the driver's float32 stores and floor/truncate steps. */
function samplePoint(wave: Wave, phase: number, t: number): [number, number] {
  const x = wave.originX + Math.floor(f32(t * wave.xStep))
  const radians = f32(f32(phase + t) * DEG_TO_RAD)
  const y = wave.centreY + Math.floor(f32(f32(Math.sin(radians)) * wave.amplitude))
  return [x, y]
}

export const createSineWave: CreateAnimation = ({ keys, color, speed, random }) => {
  const wave = measure(keys)
  const keyAt = keyFinder(keys)
  const lit = fadingKeys(keys, SLOT_COUNT, FADE_PER_TICK)
  let phase = PHASE_START_DEG // descriptor[10]

  const step = () => {
    lit.fade()
    for (let t = 0; t <= wave.sweep; t += SAMPLE_STEP_DEG) {
      const [x, y] = samplePoint(wave, phase, t)
      const led = keyAt(x, y)
      // Only dark keys are lit, so a key under a still curve pulses every four ticks.
      if (led < 0 || led >= SLOT_COUNT || !lit.isDark(led)) continue
      lit.light(led, color ?? randomDriverColor(COLORFUL_COUNT, random), LIT_ALPHA)
    }
    phase -= PHASE_STEP_DEG
    if (phase < 0) phase = PHASE_START_DEG
  }

  step() // FUN_0041ba70 runs one frame before arming the timer
  return { interval: intervalForSpeed(PERIOD_MS, speed), step, colors: lit.colors }
}
