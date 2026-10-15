/**
 * What every effect animation implements. Each one ports one effect of the
 * on-screen preview in AULA's F75 driver (OemDrv.exe, never run): the driver
 * fills a descriptor per effect and a timer steps it, a tick at a time
 * (docs/reverse-engineering/report.md §21). So an animation is a small state
 * machine: the caller calls step() once per `interval` ms and draws colors().
 *
 * Coordinates are the driver's keyboard picture units, as in protocol/keys.ts.
 */
import type { Rgb } from '@/protocol/bytes'
import type { Key } from '@/protocol/keys'

export type { Rgb }

/** A key with its rectangle and LED index; protocol/keys.ts's Key fits. */
export type AnimKey = Pick<Key, 'name' | 'led' | 'x' | 'y' | 'w' | 'h'>

export interface AnimationOptions {
  /** The board's keys, with their rectangles. */
  keys: readonly AnimKey[]
  /** The effect's colour, or null when it's colourful ("random" in the driver) or has none. */
  color: Rgb | null
  /** The effect's speed, 0..4 as on the board. */
  speed: number
  /** Uniform in [0, 1), seeded by the caller so tests are repeatable. */
  random: () => number
}

export interface EffectAnimation {
  /** Milliseconds between ticks (the driver's timer period at this speed). */
  readonly interval: number
  /** Advances one tick. */
  step(): void
  /** A key was pressed, for the effects that react to typing. */
  press?(led: number): void
  /** Each LED's colour now; LEDs left out are dark. Brightness is the caller's. */
  colors(): ReadonlyMap<number, Rgb>
}

export type CreateAnimation = (options: AnimationOptions) => EffectAnimation

/** When the driver's preview ignores speed: its period is speed 2's, and each step up is √2 faster. */
export const speedScale = (speed: number) => 2 ** ((2 - speed) / 2)
