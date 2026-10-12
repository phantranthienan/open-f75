import { describe, expect, it } from 'vitest'
import blue from '@test/golden/f87-dongle-fixed-on-blue.json'
import green from '@test/golden/f87-dongle-fixed-on-green.json'
import red from '@test/golden/f87-dongle-fixed-on-red.json'
import { F75_SETTINGS } from '@/transports/mock-data'
import { formatHexColor, fromHex, parseHexColor, toHex, type Rgb } from '@/protocol/bytes'
import {
  CONFIG_FRAME_COUNT,
  PALETTE_FRAME_COUNT,
  assertConfig,
  buildFrame,
  buildPalette,
  buildReadConfigRequest,
  buildSave,
  buildStaticColorConfig,
  buildStaticColorFrames,
  checksum,
  colorTableFromPaletteFrames,
  isValidFrame,
  settingsFromConfigFrames,
} from '@/protocol/dongle'
import { FIXED_ON, SettingsOffset, colorRow, colorTableMatchesLayout, effectSlot, isSettingsPage } from '@/protocol/settings'

interface Golden {
  frames: { dir: string; hex: string }[]
}

/** Splits an OEM capture into the parts of the static-colour sequence. */
function load(golden: Golden) {
  const frames = golden.frames.map((f) => ({ dir: f.dir, bytes: fromHex(f.hex) }))
  const tx = frames.filter((f) => f.dir === 'tx').map((f) => f.bytes)
  const rx = frames.filter((f) => f.dir === 'rx').map((f) => f.bytes)
  const cmd = (list: Uint8Array[], c: number) => list.filter((f) => f[1] === c)
  return {
    all: frames.map((f) => f.bytes),
    readRequest: cmd(tx, 0x44),
    config: cmd(rx, 0x44),
    configWrites: cmd(tx, 0x04),
    paletteWrites: cmd(tx, 0x09),
    saveEcho: cmd(rx, 0x0a),
  }
}

const captures: [string, Golden, Rgb][] = [
  ['red', red, [0xff, 0x00, 0x00]],
  ['green', green, [0x00, 0xff, 0x00]],
  ['blue', blue, [0x00, 0x00, 0xff]],
]

describe('frames', () => {
  it('builds a 20-byte frame with report ID, header, payload and checksum', () => {
    const frame = buildFrame(0x0a, 0x01, 0, [0x04, 0x07])
    expect(toHex(frame)).toBe('13 0a 01 00 04 07 00 00 00 00 00 00 00 00 00 00 00 00 00 29')
    expect(isValidFrame(frame)).toBe(true)
  })

  it('rejects payloads over 15 bytes', () => {
    expect(() => buildFrame(0x04, 0x0a, 0, new Array(16).fill(0))).toThrow(RangeError)
  })

  it.each(captures)('agrees with the checksum of every frame in the %s capture', (_, golden) => {
    const { all } = load(golden)
    expect(all.length).toBeGreaterThan(90)
    for (const frame of all) expect(checksum(frame)).toBe(frame[19])
  })

  it('flags a frame with a bad checksum', () => {
    const frame = buildReadConfigRequest()
    frame[19] ^= 0xff
    expect(isValidFrame(frame)).toBe(false)
  })
})

describe.each(captures)('static colour vs OEM capture (%s)', (_, golden, rgb) => {
  const capture = load(golden)

  it('sends the same config read request', () => {
    expect(capture.readRequest).toHaveLength(1)
    expect(toHex(buildReadConfigRequest())).toBe(toHex(capture.readRequest[0]))
  })

  it('receives a complete config read', () => {
    expect(() => assertConfig(capture.config)).not.toThrow()
  })

  it('writes the same palette, byte for byte', () => {
    const ours = buildPalette(rgb)
    expect(ours).toHaveLength(PALETTE_FRAME_COUNT)
    expect(ours.map((f) => toHex(f))).toEqual(capture.paletteWrites.map((f) => toHex(f)))
  })

  it('writes the same config frame 0 (effect, flags)', () => {
    const ours = buildStaticColorConfig(capture.config)
    expect(toHex(ours[0])).toBe(toHex(capture.configWrites[0]))
  })

  it('switches effect 1 to single-colour mode and keeps its brightness', () => {
    const ours = buildStaticColorConfig(capture.config)[4]
    const oem = capture.configWrites[4]
    expect(ours[7]).toBe(oem[7]) // brightness
    expect(ours[8] & 0x0f).toBe(oem[8] & 0x0f) // mode nibble 0 = single colour
  })

  it('writes back every other config byte exactly as read', () => {
    const ours = buildStaticColorConfig(capture.config)
    const changed = new Set(['0:8', '0:14', '0:15', '0:17', '4:8'])
    ours.forEach((frame, seq) => {
      frame.forEach((byte, i) => {
        // byte 1 is the command (read -> write), byte 19 the checksum
        if (i === 1 || i === 19 || changed.has(`${seq}:${i}`)) return
        expect(byte, `frame ${seq} byte ${i}`).toBe(capture.config[seq][i])
      })
      expect(isValidFrame(frame)).toBe(true)
    })
  })

  it('ends with the save frame the board echoed', () => {
    expect(capture.saveEcho).toHaveLength(1)
    expect(toHex(buildSave())).toBe(toHex(capture.saveEcho[0]))
  })

  it('builds 10 config + 37 palette + 1 save frames, all valid', () => {
    const frames = buildStaticColorFrames(capture.config, rgb)
    expect(frames).toHaveLength(CONFIG_FRAME_COUNT + PALETTE_FRAME_COUNT + 1)
    expect(frames.every(isValidFrame)).toBe(true)
  })
})

describe.each(captures)('same data as the wired protocol (%s)', (_, golden, rgb) => {
  const capture = load(golden)

  it('reassembles the config read into a valid 128-byte settings page', () => {
    const page = settingsFromConfigFrames(capture.config)
    expect(isSettingsPage(page)).toBe(true)
  })

  it('puts the effect, the FF FF and the per-effect table where the real F75 page has them', () => {
    const page = settingsFromConfigFrames(capture.config)
    const [frame0, frame4] = [capture.config[0], capture.config[4]]
    expect(page[SettingsOffset.effect]).toBe(frame0[15]) // [F87-DOC] effect byte
    expect(toHex(page.subarray(0x38, 0x3a))).toBe(toHex(F75_SETTINGS.subarray(0x38, 0x3a)))
    expect(toHex(page.subarray(0x38, 0x3a))).toBe('ff ff')
    // [F87-DOC] effect 1 entry, frame 4 bytes 7..8, is slot 0 at 0x3a
    expect(effectSlot(page, FIXED_ON)).toEqual({ brightness: frame4[7], speed: frame4[8] >> 4, color: frame4[8] & 0x0f })
  })

  it('reassembles the OEM palette writes into a 512-byte colour table with rows of 7 colours', () => {
    const table = colorTableFromPaletteFrames(capture.paletteWrites)
    expect(colorTableMatchesLayout(table)).toBe(true)
    expect(colorRow(table, FIXED_ON)[0]).toEqual(rgb) // the custom colour went into row 1, slot 0
  })
})

describe('config validation', () => {
  const { config } = load(red)

  it('refuses a short read', () => {
    expect(() => buildStaticColorConfig(config.slice(0, 9))).toThrow(/9 frames/)
  })

  it('refuses frames out of order', () => {
    const swapped = [config[1], config[0], ...config.slice(2)]
    expect(() => buildStaticColorConfig(swapped)).toThrow(/frame 0/)
  })

  it('refuses a corrupted frame', () => {
    const broken = config.map((f) => f.slice())
    broken[3][10] ^= 0x01
    expect(() => buildStaticColorConfig(broken)).toThrow(/frame 3/)
  })

  it('does not mutate the frames it was given', () => {
    const before = config.map((f) => toHex(f))
    buildStaticColorConfig(config)
    expect(config.map((f) => toHex(f))).toEqual(before)
  })
})

describe('colours', () => {
  it('round-trips #rrggbb', () => {
    expect(parseHexColor('#12abEF')).toEqual([0x12, 0xab, 0xef])
    expect(formatHexColor([0x12, 0xab, 0xef])).toBe('#12abef')
  })

  it('rejects values outside 0..255', () => {
    expect(() => buildPalette([256, 0, 0])).toThrow(RangeError)
    expect(() => buildPalette([1.5, 0, 0])).toThrow(RangeError)
  })
})
