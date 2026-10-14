/**
 * Planning a lighting change as read-modify-write over the regions the board
 * just returned. Pure functions only: the plan lists the regions to write, in
 * the order AULA's driver writes them (per-key colours, colour table, then
 * settings page [DRV]), and every byte that changes.
 */
import { assertRgb, sameBytes, type Rgb } from '@/protocol/bytes'
import { COLOR_NAMES, FIRMWARE_COLORS, colorRow, rowMatchesLayout, withSlotZero } from '@/protocol/color-table'
import { MAX_BRIGHTNESS, MAX_SPEED, PER_KEY, effectByValue, type Effect } from '@/protocol/effects'
import { PER_KEY_LENGTH, encodePerKey, type KeyColors } from '@/protocol/per-key'
import { COLORFUL, PER_KEY_GROUP_0, SettingsOffset, assertSettingsPage, readSlot, writeSlot } from '@/protocol/settings'

export type Region = 'settings' | 'colour table' | 'per-key colours'

export interface Change {
  region: Region
  offset: number
  from: number
  to: number
}

export interface RegionWrite {
  region: Region
  bytes: Uint8Array
}

/**
 * How the effect's colour is set:
 *   firmware  the colour is already in the effect's row; the nibble selects it (settings page only)
 *   custom    the colour goes into slot 0 of the row and the nibble selects slot 0, as AULA's driver does
 *   colorful  nibble 7
 *   own       nibble 0 for an effect that has no colour of its own here (the driver's "random off")
 */
export type ColorPath = 'firmware' | 'custom' | 'colorful' | 'own'

/** What the user asked for. Controls an effect does not have are ignored; a missing one keeps the board's value. */
export interface LightingChoice {
  effect: Effect
  brightness?: number
  speed?: number
  /** A colour or 'colorful' for an effect with a colour; 'colorful' or 'own' for a colourful-only one. */
  color: Rgb | 'colorful' | 'own'
}

export interface LightingPlan {
  writes: RegionWrite[]
  changes: Change[]
  warnings: string[]
  /** Null when the effect has no colour control. */
  colorPath: ColorPath | null
  /** The colour nibble written, when colorPath is set. */
  colorIndex: number | null
}

function diff(region: Region, before: Uint8Array, after: Uint8Array): Change[] {
  const changes: Change[] = []
  before.forEach((from, offset) => {
    if (after[offset] !== from) changes.push({ region, offset, from, to: after[offset] })
  })
  return changes
}

function inRange(value: number, max: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`${what} must be 0..${max}, not ${value}`)
  return value
}

interface ColorPick {
  path: ColorPath
  nibble: number
  /** The patched colour table, or null when it does not need writing. */
  table: Uint8Array | null
}

/**
 * One colour for an effect with a colour:
 * 1. The colour is already in the effect's row (red, green, ... by default):
 *    select it with the colour nibble. Settings page only; confirmed path.
 * 2. Otherwise, if the board's row has the expected layout, put the colour in
 *    slot 0 and select slot 0, as AULA's driver does.
 * 3. Otherwise only the seven firmware colours are possible.
 */
function pickColor(effect: Effect, currentNibble: number, table: Uint8Array | null, rgb: Rgb): ColorPick {
  assertRgb(rgb)
  const layoutOk = table !== null && rowMatchesLayout(table, effect.value)
  const row = layoutOk ? colorRow(table, effect.value) : FIRMWARE_COLORS
  // Keep the selected slot if it already holds this colour (a row can hold a colour twice).
  const keep = currentNibble < row.length && sameBytes(row[currentNibble], rgb)
  const found = keep ? currentNibble : row.findIndex((c) => sameBytes(c, rgb))
  if (found >= 0) return { path: 'firmware', nibble: found, table: null }

  if (!layoutOk) {
    throw new Error(
      "Custom colours need the board's colour table in the expected layout, and this one differs. " +
        `Only the 7 firmware colours (${COLOR_NAMES.join(', ')}) are available; a backup of the table would help pin it down.`,
    )
  }
  return { path: 'custom', nibble: 0, table: withSlotZero(table, effect.value, rgb) }
}

/** The colour nibble (and colour-table patch) for the choice, or null to leave the nibble as the board has it. */
function chooseColor(effect: Effect, currentNibble: number, table: Uint8Array | null, color: LightingChoice['color']): ColorPick | null {
  // Rainbow, per-key and off have no colour control.
  if (!effect.color && !effect.colorful) return null
  if (color === 'colorful') return effect.colorful ? { path: 'colorful', nibble: COLORFUL, table: null } : null
  // A colourful-only effect that isn't colourful shows its own colours: the driver's "random off".
  if (!effect.color) return { path: 'own', nibble: 0, table: null }
  return color === 'own' ? null : pickColor(effect, currentNibble, table, color)
}

/**
 * Read-modify-write plan for one effect with its brightness, speed and colour.
 * Both inputs are what the board just returned; only the bytes listed in
 * `changes` differ in the written regions. The effect becomes live, and the
 * per-key flag at 0x09 is set only for the per-key effect, as the driver does [DRV].
 */
export function planLighting(settings: Uint8Array, colorTable: Uint8Array | null, choice: LightingChoice): LightingPlan {
  assertSettingsPage(settings)
  const { effect } = choice
  const next = Uint8Array.from(settings)
  next[SettingsOffset.effect] = effect.value
  next[SettingsOffset.perKeyMode] = effect.value === PER_KEY ? 1 : 0
  if (effect.value === PER_KEY) next[SettingsOffset.perKeyGroup] = PER_KEY_GROUP_0

  let pick: ColorPick | null = null
  const warnings: string[] = []
  if (effect.slot !== null) {
    const slot = readSlot(settings, effect)
    if (effect.brightness && choice.brightness !== undefined) slot.brightness = inRange(choice.brightness, MAX_BRIGHTNESS, 'Brightness')
    if (effect.speed && choice.speed !== undefined) slot.speed = inRange(choice.speed, MAX_SPEED, 'Speed')
    pick = chooseColor(effect, slot.color, colorTable, choice.color)
    if (pick) slot.color = pick.nibble
    writeSlot(next, effect, slot)
    if (effect.brightness && slot.brightness === 0) warnings.push(`${effect.name} brightness is 0, so the keys will stay dark.`)
  }

  const writes: RegionWrite[] = []
  const changes: Change[] = []
  if (pick?.table && colorTable) {
    writes.push({ region: 'colour table', bytes: pick.table })
    changes.push(...diff('colour table', colorTable, pick.table))
  }
  writes.push({ region: 'settings', bytes: next })
  changes.push(...diff('settings', settings, next))

  return { writes, changes, warnings, colorPath: pick?.path ?? null, colorIndex: pick?.nibble ?? null }
}

/**
 * Plan for the per-key effect in these colours: the colours (0x06, group 0),
 * then the settings page with the per-key effect selected. `before` is the
 * board's per-key colours, or null when they could not be read.
 */
export function planPerKey(settings: Uint8Array, before: Uint8Array | null, colors: KeyColors): LightingPlan {
  const bytes = encodePerKey(colors)
  const select = planLighting(settings, null, { effect: effectByValue(PER_KEY), color: 'own' })
  return {
    ...select,
    writes: [{ region: 'per-key colours', bytes }, ...select.writes],
    changes: [...diff('per-key colours', before ?? new Uint8Array(PER_KEY_LENGTH), bytes), ...select.changes],
  }
}

/** What the board holds for one effect, as the controls show it. */
export interface EffectState {
  brightness: number
  speed: number
  colorful: boolean
  /** The colour the nibble selects, or null when the effect has no colour or is colourful. */
  color: Rgb | null
}

/** Decodes an effect's slot (and its colour from the colour table), or null for an effect without a slot. */
export function readEffectState(settings: Uint8Array, colorTable: Uint8Array | null, effect: Effect): EffectState | null {
  assertSettingsPage(settings)
  if (effect.slot === null) return null
  const slot = readSlot(settings, effect)
  const colorful = slot.color === COLORFUL
  let color: Rgb | null = null
  if (effect.color && slot.color < FIRMWARE_COLORS.length) {
    const row = colorTable && rowMatchesLayout(colorTable, effect.value) ? colorRow(colorTable, effect.value) : FIRMWARE_COLORS
    color = row[slot.color]
  }
  return {
    brightness: Math.min(slot.brightness, MAX_BRIGHTNESS),
    speed: Math.min(slot.speed, MAX_SPEED),
    colorful,
    color,
  }
}
