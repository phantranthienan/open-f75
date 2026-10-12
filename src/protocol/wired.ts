/**
 * The wired (USB cable) protocol: 520-byte HID feature reports, report ID 0x06,
 * on a vendor collection (usage page 0xFF00) of the board's second interface.
 * Pure functions only.
 *
 *   [0]     report ID 0x06
 *   [1]     command; reads have the high bit set
 *   [2]     parameter (sub-selector, e.g. 0x01 for the identity read)
 *   [3]     0
 *   [4]     total packages = ceil(length / 512)
 *   [5]     package index, 0-based
 *   [6..7]  payload length, little endian, <= 512
 *   [8..]   payload, zero padded to 520 bytes
 *
 * A read is a SET_FEATURE carrying only the header (the length field says how
 * much to return), then a GET_FEATURE on the same report ID. The reply repeats
 * the header and carries the data from byte 8.
 *
 * Sources:
 *   [ASL]  references/AulaSofwareLinux/src/proto.rs, recovered from AULA's own
 *          driver (OemDrv.exe) and verified on an F75
 *   [ORGB] references/OpenRGB/Controllers/SinowealthController/SinowealthControllerDetect.cpp,
 *          which sends the same identity request `06 82 01 00 01 00 06`
 *   [CAP]  test/golden/f87-wired-direct.json: the OEM app's 0x08 frames carry
 *          `01 00 7a 01` = 1 package, index 0, length 378 (126 LEDs x 3)
 */
import { toHex } from './bytes'

export const REPORT_ID = 0x06
/** Whole report including the report ID; the firmware rejects short reports [ASL]. */
export const REPORT_LENGTH = 520
/** What WebHID sends and declares: the report without its ID byte. */
export const DATA_LENGTH = REPORT_LENGTH - 1
export const HEADER_LENGTH = 8
export const MAX_PAYLOAD = 512

/** The commands this app uses [ASL]. */
export const Cmd = {
  GetInfo: 0x82,
  GetSettings: 0x84,
  SetSettings: 0x04,
  GetColorTable: 0x8a,
  SetColorTable: 0x0a,
} as const

/**
 * Known but deliberately unused, so the guard refuses them [ASL]:
 * 0x03/0x83 key matrix, 0x05/0x85 macros, 0x06/0x86 game mode, 0x08 direct
 * LEDs (Phase 5), 0x0b screen, 0x11 factory reset, 0x87 battery.
 */

/** GET_INFO parameter that returns the 6-byte model identity [ASL]. */
export const INFO_IDENTITY = 0x01
export const IDENTITY_LENGTH = 6

/** Delay AULA's driver leaves before every transfer [ASL]. */
export const TRANSFER_DELAY_MS = 20

export interface Header {
  cmd: number
  param: number
  reserved: number
  packages: number
  index: number
  length: number
}

export function parseHeader(frame: Uint8Array): Header {
  return {
    cmd: frame[1],
    param: frame[2],
    reserved: frame[3],
    packages: frame[4],
    index: frame[5],
    length: frame[6] | (frame[7] << 8),
  }
}

function frame(cmd: number, param: number, length: number, payload: ArrayLike<number> = []): Uint8Array {
  if (length > MAX_PAYLOAD) throw new RangeError(`${length} bytes needs more than one package; not supported`)
  const out = new Uint8Array(REPORT_LENGTH)
  out[0] = REPORT_ID
  out[1] = cmd
  out[2] = param
  out[4] = length === 0 ? 0 : 1
  out[5] = 0
  out[6] = length & 0xff
  out[7] = length >> 8
  out.set(payload, HEADER_LENGTH)
  return out
}

/** SET_FEATURE half of a read: the header asking for `length` bytes back. */
export function buildReadRequest(cmd: number, param: number, length: number): Uint8Array {
  return frame(cmd, param, length)
}

/** A single-package write. Every write this app makes fits in one package. */
export function buildWrite(cmd: number, param: number, data: Uint8Array): Uint8Array {
  return frame(cmd, param, data.length, data)
}

/** `06 82 01 00 01 00 06 00`, byte for byte what [ASL] and [ORGB] send. */
export function buildIdentityRequest(): Uint8Array {
  return buildReadRequest(Cmd.GetInfo, INFO_IDENTITY, IDENTITY_LENGTH)
}

/**
 * A GET_FEATURE result as a full 520-byte frame. Browsers differ on whether
 * the result starts with the report ID, so both 519 and 520 bytes are accepted.
 */
export function normalizeReply(raw: Uint8Array): Uint8Array {
  if (raw.length === REPORT_LENGTH && raw[0] === REPORT_ID) return raw
  if (raw.length === DATA_LENGTH) {
    const full = new Uint8Array(REPORT_LENGTH)
    full[0] = REPORT_ID
    full.set(raw, 1)
    return full
  }
  throw new Error(`reply is ${raw.length} bytes, expected ${DATA_LENGTH} or ${REPORT_LENGTH}`)
}

/** The `length` data bytes of a reply, after checking it answers `cmd`. */
export function parseReply(reply: Uint8Array, cmd: number, length: number): Uint8Array {
  const full = normalizeReply(reply)
  if (full[1] !== cmd) {
    throw new Error(`reply is for command 0x${full[1].toString(16)}, expected 0x${cmd.toString(16)}`)
  }
  return full.slice(HEADER_LENGTH, HEADER_LENGTH + length)
}

export const isReadCommand = (cmd: number) => (cmd & 0x80) !== 0

/**
 * Header plus payload as hex, without the zero padding (the guard checks it is
 * zero). Read requests carry no payload, so by default only their header is shown.
 */
export function compactHex(frame: Uint8Array, withPayload = !isReadCommand(frame[1])): string {
  const { length } = parseHeader(frame)
  const shown = withPayload ? Math.min(length, MAX_PAYLOAD) : 0
  return toHex(frame.subarray(0, HEADER_LENGTH + shown))
}
