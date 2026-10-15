/**
 * Rainbow (preview 2, descriptor type 2): the whole board is one colour that
 * cycles red, green, blue, magenta, orange, each fading into the next over
 * 1.4 s (a 7.35 s loop). It has no colour or colourful setting.
 *
 * Driver (decomp.c line numbers; spec in docs/reverse-engineering/previews/rainbow.md):
 * the dispatcher computes period 0x46 and calls FUN_004851e0, which gives
 * FUN_00484e00 one unit, five colours, hold 70 ms and fade 1400 ms; the engine's
 * type 2 branch (18138) paints every key with that unit's colour.
 */
import { paletteCycleAnimation } from '@/ui/lib/animations/palette-cycle'
import type { CreateAnimation, Rgb } from '@/ui/lib/animations/types'

const PERIOD_MS = 70

/** COLORREFs 0xff, 0xff00, 0xff0000, 0xff00ff, 0x80ff (0x48527e..0x48529e). */
const PALETTE: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [255, 128, 0],
]

export const createRainbow: CreateAnimation = ({ keys, speed }) =>
  paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: PERIOD_MS, fadeMs: 20 * PERIOD_MS, palette: PALETTE, spread: 1, direction: 0, units: [keys.map((k) => k.led)] },
    speed,
  )
