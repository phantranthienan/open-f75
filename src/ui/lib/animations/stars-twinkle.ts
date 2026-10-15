/**
 * Stars twinkle: port of AULA's driver preview 16 (descriptor type 0x10).
 *
 * Generator FUN_00487f00 stores an 80 ms period, the colour and the colourful flag. Every tick
 * the engine (FUN_0041bbb0, type-0x10 branch) fades all keys by 20 alpha, then picks seven
 * random LED slots out of 145 and relights them at alpha 180, so stars flash on and fade out
 * over nine ticks. Spec: docs/reverse-engineering/previews/stars-twinkle.md.
 */
import { fadingKeys, intervalForSpeed, randomDriverColor } from '@/ui/lib/animations/driver'
import type { CreateAnimation } from '@/ui/lib/animations/types'

/** descriptor[2]: the dispatcher passes 0x50 = 80 ms to FUN_00487f00. */
const PERIOD_MS = 80
/**
 * descriptor[0x9b]: the generator writes 200, but the dispatcher overwrites it with 0xb4 = 180
 * (0xff only when KbDrawType=1; the F75 profile has KbDrawType=0).
 */
const STAR_ALPHA = 180
/** Alpha every lit key loses per tick (`*piVar11 + -0x14`). */
const FADE_PER_TICK = 20
/**
 * Picks are `rand() % (count + 1)` over the 0x90 LED slots, so 0..144: one past
 * the records, where nothing is drawn. About 55% of picks land on a key.
 */
const PICK_RANGE = 0x90 + 1
/** Stars lit per tick. */
const STARS_PER_TICK = 7
/** Colourful mode draws `rand() % 5`: the first five driver colours. */
const COLORFUL_COUNT = 5

export const createStarsTwinkle: CreateAnimation = ({ keys, color, speed, random }) => {
  const lit = fadingKeys(keys, PICK_RANGE, FADE_PER_TICK)

  /** Seven slots; only consecutive picks must differ, so a slot can come up twice. */
  const pickSlots = (): number[] => {
    const slots: number[] = []
    let previous = -1
    while (slots.length < STARS_PER_TICK) {
      const slot = Math.floor(random() * PICK_RANGE)
      if (slot === previous) continue
      slots.push(slot)
      previous = slot
    }
    return slots
  }

  const step = () => {
    lit.fade()
    for (const slot of pickSlots()) lit.light(slot, color ?? randomDriverColor(COLORFUL_COUNT, random), STAR_ALPHA)
  }

  step() // FUN_0041ba70 runs one frame before arming the timer
  return { interval: intervalForSpeed(PERIOD_MS, speed), step, colors: lit.colors }
}
