/**
 * The driver's "palette cycle" engine, behind six effects: Rainbow (type 2),
 * Neon stream (7), Rainbow wheel (0xd), Blossoming (0xe), Rotating windmill
 * (0x1c) and Colorful waterfall (0x1e). The board is cut into units (groups of
 * keys); every unit loops through one palette, holding each colour and then
 * fading to the next, and the units start at staggered points of the loop, so
 * the colours travel across the board.
 *
 * Ported from OemDrv.exe (decomp.c line numbers):
 * - FUN_00484e00 (87704): stores the palette and the hold and fade times, and
 *   gives each unit a starting phase, `spread` palette slots apart across all units.
 * - FUN_00484ef0 (87764): one tick. A unit's phase (ms into the loop) picks a
 *   colour, held then faded to the next; then the phase moves on by the period.
 * - FUN_0041bbb0, the branches at 18138 (type 2) and 18154: unit colours to keys.
 */
import { fade, intervalForSpeed } from '@/ui/lib/animations/driver'
import type { AnimKey, EffectAnimation, Rgb } from '@/ui/lib/animations/types'

export interface PaletteCycle {
  /** Timer period in ms (descriptor [2]); each tick also moves every unit's phase on by this much. */
  readonly periodMs: number
  /** How long a palette colour is held before it fades to the next. */
  readonly holdMs: number
  /** How long the fade to the next colour takes. */
  readonly fadeMs: number
  readonly palette: readonly Rgb[]
  /** FUN_00484e00's float argument: how many palette slots the phases span across all units. */
  readonly spread: number
  /**
   * 0 hands out the phases from the last unit backwards, so unit 0 leads;
   * otherwise unit 0 trails. The F75 offers no direction, so the dispatcher
   * passes 0, except Rainbow wheel, which reads XYDirect (default 1).
   */
  readonly direction: number
  /** The units, each a list of LED indices that share one colour. */
  readonly units: readonly (readonly number[])[]
}

/**
 * FUN_00484e00's starting phases. One step is (hold + fade) * spread / units,
 * truncated; a phase that reaches the full loop restarts at 0 (not modulo).
 * With direction 0 the driver starts one past the last unit, so the last unit
 * gets one step and unit 0 gets units * step.
 */
function startingPhases(units: number, step: number, loopMs: number, direction: number): number[] {
  const phases = new Array<number>(units).fill(0)
  const order = direction !== 0 ? [...phases.keys()] : [units, ...[...phases.keys()].reverse()]
  let phase = 0
  for (const i of order) {
    if (i < units) phases[i] = phase
    phase += step
    if (phase >= loopMs) phase = 0
  }
  return phases
}

/** A palette cycle as an effect animation, at the board's speed (the driver ignores speed, see intervalForSpeed). */
export function paletteCycleAnimation(cycle: PaletteCycle, speed: number): EffectAnimation {
  const { periodMs, holdMs, fadeMs, palette, units } = cycle
  const slotMs = holdMs + fadeMs
  const loopMs = slotMs * palette.length
  // x87: fild (hold + fade), fmul float spread, fidiv units, stored as a float, then _ftol.
  const step = units.length === 0 ? 0 : Math.trunc(Math.fround((slotMs * Math.fround(cycle.spread)) / units.length))
  const phases = startingPhases(units.length, step, loopMs, cycle.direction)
  let frame: ReadonlyMap<number, Rgb> = new Map()

  /** The colour a unit shows `phase` ms into the loop (FUN_00484ef0). */
  const colorAt = (phase: number): Rgb => {
    const index = Math.trunc(phase / slotMs)
    const intoFade = phase - index * slotMs - holdMs
    if (intoFade < 0) return palette[index]
    return fade(palette[index], palette[(index + 1) % palette.length], fadeMs, intoFade)
  }

  const tick = () => {
    const next = new Map<number, Rgb>()
    units.forEach((leds, i) => {
      if (phases[i] >= loopMs) phases[i] -= loopMs
      const rgb = colorAt(phases[i])
      phases[i] += periodMs
      // Units are written in order, so a key listed twice keeps the later unit's colour.
      for (const led of leds) next.set(led, rgb)
    })
    frame = next
  }

  tick() // the starter (FUN_0041ba70) draws the first frame at once
  return { interval: intervalForSpeed(periodMs, speed), step: tick, colors: () => frame }
}

/** Keeps only the LEDs the board has; the driver skips keys its profile lacks. */
export function unitsOnBoard(units: readonly (readonly number[])[], keys: readonly AnimKey[]): number[][] {
  const present = new Set(keys.map((k) => k.led))
  return units.map((leds) => leds.filter((led) => present.has(led)))
}
