/**
 * The 2.4 GHz dongle protocol: 20-byte output reports, report ID 0x13.
 * Pure functions only. The app does not send these, and the allowlist refuses
 * report 0x13 (wired mode only). They are kept because they carry the same
 * 128-byte settings page and 512-byte colour table as the wired protocol,
 * split into 14-byte fragments (see the bottom of this file).
 *
 * Over the cable the F75 uses wired.ts instead: its interface declares no
 * report 0x13 at all (references/AulaSofwareLinux/src/hid.rs, F75 descriptor).
 *
 * Sources, cited as [tag] below:
 *   [F87-DOC]  references/Aula-F87-Controller/docs/PROTOCOL.md
 *   [F87-CAP]  that repo's captures of the OEM Windows app, recorded through the
 *              F87's dongle (3554:FA09): captures/macos-host-wireshark-vm/
 *              config-changes/1[345]-fixed-on-*.pcapng
 *
 *   [0]     report ID, always 0x13
 *   [1]     command
 *   [2]     sub-command
 *   [3]     sequence number within a multi-frame message
 *   [4..18] 15-byte payload; payload[0] is the data length (0x0E = 14)
 *   [19]    checksum = sum of bytes 0..18, mod 256
 *
 * A colour that survives a replug is a read-modify-write [F87-DOC]:
 *
 *   1. read config     1 frame out, 10 frames back
 *   2. write config   10 frames, each echoed
 *   3. write palette  37 frames, each echoed
 *   4. save            1 frame, echoed
 */
import { assertRgb, toHex, type Rgb } from '@/protocol/bytes'
import { COLOR_TABLE_LENGTH, SETTINGS_LENGTH } from '@/protocol/settings'

export const REPORT_ID = 0x13
export const FRAME_LENGTH = 20 // including the report ID byte
export const PAYLOAD_LENGTH = 15
/** Data bytes per fragment after the length byte. */
const FRAGMENT_DATA = 14

export const Cmd = {
  ReadConfig: 0x44,
  WriteConfig: 0x04,
  WritePalette: 0x09,
  Save: 0x0a,
} as const

export const Sub = {
  Confirm: 0x01,
  Config: 0x0a,
  Palette: 0x25,
} as const

export const CONFIG_FRAME_COUNT = 10
export const PALETTE_FRAME_COUNT = 37

/** Effect numbers live in config frame 0, byte 15 [F87-DOC]. */
export const Effect = {
  FixedOn: 1,
} as const

// ── Frames ──────────────────────────────────────────────────────────────

export function checksum(frame: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < FRAME_LENGTH - 1; i++) sum += frame[i]
  return sum & 0xff
}

export function buildFrame(
  cmd: number,
  sub: number,
  seq: number,
  payload: ArrayLike<number> = [],
): Uint8Array {
  if (payload.length > PAYLOAD_LENGTH) {
    throw new RangeError(`payload is ${payload.length} bytes, max ${PAYLOAD_LENGTH}`)
  }
  const frame = new Uint8Array(FRAME_LENGTH)
  frame[0] = REPORT_ID
  frame[1] = cmd
  frame[2] = sub
  frame[3] = seq
  frame.set(payload, 4)
  frame[19] = checksum(frame)
  return frame
}

export function isValidFrame(frame: Uint8Array): boolean {
  return (
    frame.length === FRAME_LENGTH &&
    frame[0] === REPORT_ID &&
    frame[19] === checksum(frame)
  )
}

function withChecksum(frame: Uint8Array): Uint8Array {
  frame[19] = checksum(frame)
  return frame
}

// ── 1. Read config ──────────────────────────────────────────────────────

/** `13 44 01 00 … 58` [F87-CAP] */
export function buildReadConfigRequest(): Uint8Array {
  return buildFrame(Cmd.ReadConfig, Sub.Confirm, 0)
}

export function isConfigResponse(frame: Uint8Array): boolean {
  return (
    isValidFrame(frame) &&
    frame[1] === Cmd.ReadConfig &&
    frame[2] === Sub.Config &&
    frame[3] < CONFIG_FRAME_COUNT
  )
}

/** Throws unless `frames` is a complete config read: 10 valid frames, seq 0..9 in order. */
export function assertConfig(frames: readonly Uint8Array[]): void {
  if (frames.length !== CONFIG_FRAME_COUNT) {
    throw new Error(`config has ${frames.length} frames, expected ${CONFIG_FRAME_COUNT}`)
  }
  frames.forEach((frame, seq) => {
    if (!isConfigResponse(frame) || frame[3] !== seq) {
      throw new Error(`config frame ${seq} is not a valid read response: ${toHex(frame)}`)
    }
  })
}

// ── 2. Write config ─────────────────────────────────────────────────────

/**
 * Byte offsets inside config frames [F87-DOC], checked against [F87-CAP],
 * where the OEM app turned a read of effect 0x0B into a write of effect 0x01.
 */
const CFG0 = {
  /** OEM app writes 0x01. [F87-DOC] calls it a confirm flag, but the F87 repo's
   *  debounce code also stores debounce here. Unresolved; we copy the OEM app. */
  confirm: 8,
  /** The board sets this to 0x01 after applying; a write must clear it or it is ignored. */
  applied: 14,
  effect: 15,
  /** 0x01 = custom colour or colourful, 0x03 = default. */
  colorMode: 17,
} as const

/** Per-effect [brightness, speed|mode] pairs. Effect 1 sits in frame 4 at bytes 7 and 8. */
const FIXED_ON_SLOT = { frame: 4, brightness: 7, speedMode: 8 } as const

/**
 * Turns a config read into the 10 config writes for "Fixed on, custom colour".
 * Only the bytes listed above change; everything else is written back as read.
 */
export function buildStaticColorConfig(config: readonly Uint8Array[]): Uint8Array[] {
  assertConfig(config)
  return config.map((read, seq) => {
    const frame = Uint8Array.from(read)
    frame[1] = Cmd.WriteConfig
    if (seq === 0) {
      frame[CFG0.confirm] = 0x01
      frame[CFG0.applied] = 0x00
      frame[CFG0.effect] = Effect.FixedOn
      frame[CFG0.colorMode] = 0x01
    }
    if (seq === FIXED_ON_SLOT.frame) {
      // high nibble = speed (kept), low nibble = mode: 0x0 single colour, 0x7 colourful
      frame[FIXED_ON_SLOT.speedMode] &= 0xf0
    }
    return withChecksum(frame)
  })
}

// ── 3. Write palette ────────────────────────────────────────────────────

/**
 * The 37 palette payloads the OEM app sent for "Fixed on, red" [F87-CAP].
 * Frames 2–20 hold colours for other effects; we replay them untouched.
 */
const PALETTE_TEMPLATE: readonly (readonly number[])[] = (() => {
  const zeros = [0x0e, ...new Array<number>(14).fill(0)]
  const a = [0x0e, 0x00, 0xff, 0xff, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff]
  const b = [0x0e, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0xff, 0x00]
  const c = [0x0e, 0xff, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00]
  const frames: number[][] = [
    zeros,
    [0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00],
  ]
  for (let i = 0; i < 6; i++) frames.push(a, b, c) // frames 2..19
  frames.push(a) // frame 20
  while (frames.length < PALETTE_FRAME_COUNT - 1) frames.push(zeros) // frames 21..35
  frames.push([0x08, 0x00, 0x00, 0x5a, 0xa5, ...new Array<number>(10).fill(0)]) // 36: end marker
  return frames
})()

/**
 * The custom colour slot: palette frame 1, payload bytes 8..10 [F87-CAP].
 * [F87-DOC] calls payload byte 12 an "active flag"; reassembled into the colour
 * table it is the green byte of the next slot, so it is left as the template has it.
 */
const CUSTOM_COLOR_SLOT = { frame: 1, rgb: 8 } as const

export function buildPalette(rgb: Rgb): Uint8Array[] {
  assertRgb(rgb)
  return PALETTE_TEMPLATE.map((template, seq) => {
    const payload = Uint8Array.from(template)
    if (seq === CUSTOM_COLOR_SLOT.frame) payload.set(rgb, CUSTOM_COLOR_SLOT.rgb)
    return buildFrame(Cmd.WritePalette, Sub.Palette, seq, payload)
  })
}

// ── 4. Save ─────────────────────────────────────────────────────────────

/** `13 0a 01 00 04 07 … 29` [F87-DOC], echoed back in [F87-CAP] */
export function buildSave(): Uint8Array {
  return buildFrame(Cmd.Save, Sub.Confirm, 0, [0x04, 0x07])
}

// ── Whole sequence ──────────────────────────────────────────────────────

/** Steps 2–4 for a fixed custom colour: 10 config + 37 palette + 1 save = 48 frames. */
export function buildStaticColorFrames(config: readonly Uint8Array[], rgb: Rgb): Uint8Array[] {
  return [...buildStaticColorConfig(config), ...buildPalette(rgb), buildSave()]
}

// ── Same data as the wired protocol ─────────────────────────────────────

/** Joins the data bytes of consecutive fragments, using each fragment's length byte. */
function reassemble(frames: readonly Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  let at = 0
  for (const frame of frames) {
    const data = frame.subarray(5, 5 + Math.min(frame[4], FRAGMENT_DATA))
    out.set(data.subarray(0, Math.max(0, length - at)), at)
    at += data.length
  }
  if (at !== length) throw new Error(`fragments carry ${at} bytes, expected ${length}`)
  return out
}

/** The 10 config fragments as the 128-byte settings page that wired.ts reads with 0x84. */
export function settingsFromConfigFrames(config: readonly Uint8Array[]): Uint8Array {
  assertConfig(config)
  return reassemble(config, SETTINGS_LENGTH)
}

/** The 37 palette fragments as the 512-byte colour table that wired.ts reads with 0x8a. */
export function colorTableFromPaletteFrames(palette: readonly Uint8Array[]): Uint8Array {
  if (palette.length !== PALETTE_FRAME_COUNT || !palette.every(isValidFrame)) {
    throw new Error(`expected ${PALETTE_FRAME_COUNT} valid palette frames`)
  }
  return reassemble(palette, COLOR_TABLE_LENGTH)
}
