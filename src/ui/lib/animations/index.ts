/**
 * The effect animations, by effect: each ports the on-screen preview AULA's
 * driver shows for that effect (types.ts). Off has none, and neither have the
 * effects AULA hides on the F75.
 */
import type { Effect } from '@/protocol/effects'
import { createBlossoming } from '@/ui/lib/animations/blossoming'
import { createBreathing } from '@/ui/lib/animations/breathing'
import { createColorfulWaterfall } from '@/ui/lib/animations/colorful-waterfall'
import { createFixedOn } from '@/ui/lib/animations/fixed-on'
import { createFlashAway } from '@/ui/lib/animations/flash-away'
import { createNeonStream } from '@/ui/lib/animations/neon-stream'
import { createRainbow } from '@/ui/lib/animations/rainbow'
import { createRainbowWheel } from '@/ui/lib/animations/rainbow-wheel'
import { createRaindrops } from '@/ui/lib/animations/raindrops'
import { createReaction } from '@/ui/lib/animations/reaction'
import { createRetroSnake } from '@/ui/lib/animations/retro-snake'
import { createRipplesShining } from '@/ui/lib/animations/ripples-shining'
import { createRotatingWindmill } from '@/ui/lib/animations/rotating-windmill'
import { createSineWave } from '@/ui/lib/animations/sine-wave'
import { createStarsTwinkle } from '@/ui/lib/animations/stars-twinkle'
import type { AnimationOptions, CreateAnimation, EffectAnimation } from '@/ui/lib/animations/types'

/** Effect value (settings byte 0x0a, effects.ts) -> its animation. */
const ANIMATIONS: Partial<Record<number, CreateAnimation>> = {
  1: createFixedOn,
  2: createBreathing,
  3: createRainbow,
  4: createFlashAway,
  5: createRaindrops,
  6: createRainbowWheel,
  7: createRipplesShining,
  8: createStarsTwinkle,
  10: createRetroSnake,
  11: createNeonStream,
  12: createReaction,
  13: createSineWave,
  15: createRotatingWindmill,
  16: createColorfulWaterfall,
  17: createBlossoming,
}

/** Flash away, Ripples shining and Reaction start from a key press. */
const REACTIVE = new Set([4, 7, 12])

/** The effect's animation, or null for one without (off, per-key, hidden effects). */
export function createAnimation(effect: Effect, options: AnimationOptions): EffectAnimation | null {
  return ANIMATIONS[effect.value]?.(options) ?? null
}

export const reactsToKeys = (effect: Effect) => REACTIVE.has(effect.value)
