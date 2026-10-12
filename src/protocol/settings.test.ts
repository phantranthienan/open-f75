import { describe, expect, it } from 'vitest'
import { F75_SETTINGS, F87_COLOR_TABLE } from '@/transports/mock-data'
import type { Rgb } from '@/protocol/bytes'
import {
  FIXED_ON,
  SettingsOffset,
  colorRow,
  colorTableMatchesLayout,
  describeBoard,
  effectSlot,
  isSettingsPage,
  planStaticColor,
} from '@/protocol/settings'

const page = () => Uint8Array.from(F75_SETTINGS)
const table = () => Uint8Array.from(F87_COLOR_TABLE)
const GREEN: Rgb = [0, 255, 0]

describe('settings page (real F75 dump)', () => {
  it('is a valid page', () => {
    expect(isSettingsPage(page())).toBe(true)
    expect(isSettingsPage(page().subarray(0, 127))).toBe(false)
  })

  it('reads Fixed on, red, brightness 9, as [ASL] found it', () => {
    expect(page()[SettingsOffset.effect]).toBe(FIXED_ON)
    expect(effectSlot(page(), FIXED_ON)).toEqual({ brightness: 9, speed: 4, color: 0 })
    expect(describeBoard(page(), table())).toMatchObject({ effect: 1, color: [255, 0, 0] })
  })
})

describe('colour table layout check', () => {
  it('accepts the reassembled OEM table', () => {
    expect(colorTableMatchesLayout(table())).toBe(true)
  })

  it('ignores slot 0, which holds the custom colour', () => {
    const t = table()
    t.set([0x12, 0x34, 0x56], 21)
    expect(colorTableMatchesLayout(t)).toBe(true)
  })

  it('rejects a table whose default colours differ, or without its marker', () => {
    const shifted = table()
    shifted[24] ^= 0xff
    expect(colorTableMatchesLayout(shifted)).toBe(false)
    const unmarked = table()
    unmarked[506] = 0
    expect(colorTableMatchesLayout(unmarked)).toBe(false)
    expect(colorTableMatchesLayout(new Uint8Array(270))).toBe(false)
  })
})

describe('planStaticColor', () => {
  it('does nothing when the board already shows the colour', () => {
    const plan = planStaticColor(page(), table(), [255, 0, 0])
    expect(plan.changes).toEqual([])
    expect(plan.colorTable).toBeNull()
  })

  it('selects green with one byte, the same byte Fn+Tab moved on a real F75', () => {
    // [ASL] config_page.rs: Fn+Tab on Fixed on moved only 0x3b, from 0x40 to 0x41
    const plan = planStaticColor(page(), table(), GREEN)
    expect(plan.changes).toEqual([{ region: 'settings', offset: 0x3b, from: 0x40, to: 0x41 }])
    expect(plan.custom).toBe(false)
  })

  it('also selects firmware colours when the colour table is unavailable', () => {
    expect(planStaticColor(page(), null, GREEN).changes).toEqual([
      { region: 'settings', offset: 0x3b, from: 0x40, to: 0x41 },
    ])
  })

  it('switches from another effect to Fixed on, keeping brightness and speed', () => {
    const p = page()
    p[SettingsOffset.effect] = 0x0b
    const plan = planStaticColor(p, table(), GREEN)
    expect(plan.changes).toEqual([
      { region: 'settings', offset: 0x0a, from: 0x0b, to: 0x01 },
      { region: 'settings', offset: 0x3b, from: 0x40, to: 0x41 },
    ])
  })

  it('puts a custom colour in row 1, slot 0, as the OEM app did', () => {
    const p = page()
    p[0x3b] = 0x43 // was showing yellow
    const plan = planStaticColor(p, table(), [0x12, 0x34, 0x56])
    expect(plan.custom).toBe(true)
    expect(colorRow(plan.colorTable!, FIXED_ON)[0]).toEqual([0x12, 0x34, 0x56])
    expect(plan.changes).toEqual([
      { region: 'colour table', offset: 21, from: 0xff, to: 0x12 },
      { region: 'colour table', offset: 22, from: 0x00, to: 0x34 },
      { region: 'colour table', offset: 23, from: 0x00, to: 0x56 },
      { region: 'settings', offset: 0x3b, from: 0x43, to: 0x40 },
    ])
  })

  it('refuses a custom colour when the table does not match the layout', () => {
    const t = table()
    t[24] ^= 0xff
    expect(() => planStaticColor(page(), t, [0x12, 0x34, 0x56])).toThrow(/7 firmware colours/)
    expect(() => planStaticColor(page(), null, [0x12, 0x34, 0x56])).toThrow(/7 firmware colours/)
  })

  it('warns when Fixed on brightness is 0', () => {
    const p = page()
    p[0x3a] = 0
    expect(planStaticColor(p, table(), GREEN).warnings).toHaveLength(1)
  })

  it('refuses something that is not a settings page, and never mutates its inputs', () => {
    expect(() => planStaticColor(new Uint8Array(128), table(), GREEN)).toThrow(/not a settings page/)
    const p = page()
    const t = table()
    planStaticColor(p, t, [1, 2, 3])
    expect(p).toEqual(F75_SETTINGS)
    expect(t).toEqual(F87_COLOR_TABLE)
  })
})
