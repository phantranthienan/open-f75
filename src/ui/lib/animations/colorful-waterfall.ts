/**
 * Colorful waterfall (F75 LedOpt16, preview 30): bands of green, blue, magenta
 * and yellow flow down the board one key row at a time.
 *
 * Driver: dispatcher FUN_00431ca0 case 0x1e (decomp.c 31964) calls the generator
 * FUN_00486440 (88815), which builds one unit per key row and hands them to the
 * shared palette cycle (palette-cycle.ts). No unit file is involved.
 * Spec: docs/reverse-engineering/previews/colorful-waterfall.md.
 */
import type { CreateAnimation } from '@/ui/lib/animations/types'
import { colorRefToRgb, rowsThrough } from '@/ui/lib/animations/driver'
import { paletteCycleAnimation } from '@/ui/lib/animations/palette-cycle'

/** Hard-coded in the generator (0x486494), unlike most previews. */
const PERIOD_MS = 200
/** Pushed by the generator (0x4865c9, 0x4865d6). */
const HOLD_MS = 400
const FADE_MS = 800
/** Green, blue, magenta, yellow (COLORREFs at 0x4865db..0x4865f3). */
const PALETTE = [0x00ff00, 0xff0000, 0xff00ff, 0x00ffff].map(colorRefToRgb)
/** Float 3.0 at 0x626e90: the six rows span three colours, so each colour covers two rows. */
const SPREAD = 3
/** The F75 offers no direction (LedOpt16's fifth number is 0), so the dispatcher passes 0: top row leads. */
const DIRECTION = 0

/**
 * One anchor key per row, top to bottom: VK F1, 1, Q, A, Z, LCtrl
 * (0x4864c9..0x4864f1). A profile can replace them with `KeyLineStart=`
 * (decomp.c 12109); the F75's does not. Each row is every key through the
 * anchor's vertical centre (rowsThrough).
 */
const ROW_ANCHORS = ['F1', '1', 'Q', 'A', 'Z', 'LCtrl']

// options.color and the colourful flag are not used: the dispatcher never passes
// them to this generator, which always uses its own palette.
export const createColorfulWaterfall: CreateAnimation = ({ keys, speed }) => {
  const rows = rowsThrough(keys, ROW_ANCHORS).map((row) => row.map((k) => k.led))
  return paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: HOLD_MS, fadeMs: FADE_MS, palette: PALETTE, spread: SPREAD, direction: DIRECTION, units: rows },
    speed,
  )
}
