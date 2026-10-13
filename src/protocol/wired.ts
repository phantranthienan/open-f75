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
 * AULA's driver builds exactly this frame for the F75 (profile Fw=24; other
 * firmwares get report ID 9), waits 20 ms before every SET_FEATURE and again
 * before the GET_FEATURE, and tries a failed SET_FEATURE 3 times, 70 ms apart
 * [DRV].
 *
 * Sources:
 *   [DRV]  AULA's F75 driver, OemDrv.exe from "AULA F75 Setup v2.0 20260514.exe"
 *          (SHA-256 1dfe4803...ae44a7), class CDevG5KB (FUN_004993c0 and the
 *          read functions next to it), decompiled with Ghidra 12.1.4; never run.
 *          See docs/reverse-engineering/report.md
 *   [ASL]  references/AulaSofwareLinux/src/proto.rs, recovered from AULA's own
 *          driver (OemDrv.exe) and verified on an F75
 *   [ORGB] references/OpenRGB/Controllers/SinowealthController/SinowealthControllerDetect.cpp,
 *          which sends the same identity request `06 82 01 00 01 00 06`
 *   [CAP]  references/Aula-F87-Controller/captures/windows-npcap-wireshark/raining-silk.pcapng:
 *          the OEM app's wired 0x08 frames carry `01 00 7a 01` = 1 package,
 *          index 0, length 378 (126 LEDs x 3)
 *   [UPD]  AULA's firmware updater, references/AulaSofwareLinux/assets/devices/
 *          f87-pro-wired-wired/Update.exe (SHA-256 95366eda...29843), decompiled
 *          with Ghidra 12.1.4 through REA; never run
 */
import { toHex } from '@/protocol/bytes'

export const REPORT_ID = 0x06
/** Whole report including the report ID; the firmware rejects short reports [ASL]. */
export const REPORT_LENGTH = 520
/** What WebHID sends and declares: the report without its ID byte. */
export const DATA_LENGTH = REPORT_LENGTH - 1
export const HEADER_LENGTH = 8
export const MAX_PAYLOAD = 512

/** The commands this app uses [ASL] [DRV]. */
export const Cmd = {
  GetInfo: 0x82,
  GetSettings: 0x84,
  SetSettings: 0x04,
  GetColorTable: 0x8a,
  SetColorTable: 0x0a,
} as const

/**
 * Known but deliberately unused, so the guard refuses them [DRV]: 0x03/0x83
 * key matrix (parameter = layer), 0x05/0x85 macros, 0x06/0x86 per-key colours
 * (parameter = group; the driver's log calls it "SetGame"), 0x08 direct LEDs,
 * 0x0b/0x0c/0x0d screen, 0x0e/0x0f, 0x11 factory reset, 0x87 battery,
 * 0x88 "GetRealData".
 *
 * Firmware updates never use this channel [UPD]. The updater sends
 * `05 75 00 00 00 00` ('u') on feature report 0x05 to the running board to
 * restart it into its bootloader, which enumerates as 0603:1020. There it
 * erases ('E'), writes ('W'), reads back ('R') and burns ('U') over report
 * 0x05, with 2050-byte data reports on 0x06. The allowlist only passes report
 * 0x06 with 519 data bytes, and device-check.ts sends nothing to any ID but
 * 258A:010C, so none of that can be sent.
 */

/** GET_INFO parameter that returns the 6-byte model identity [ASL] [DRV]. */
export const INFO_IDENTITY = 0x01
export const IDENTITY_LENGTH = 6

/** Delay AULA's driver leaves before every transfer [ASL] [DRV]. */
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

/** `06 82 01 00 01 00 06 00`, byte for byte what [DRV], [ASL] and [ORGB] send. */
export function buildIdentityRequest(): Uint8Array {
  return buildReadRequest(Cmd.GetInfo, INFO_IDENTITY, IDENTITY_LENGTH)
}

/**
 * The `length` data bytes of a GET_FEATURE reply, after checking it answers `cmd`.
 *
 * Platforms hand the reply over differently, so all of these are accepted:
 *   - with or without the report ID as the first byte
 *   - the full 519/520 bytes, or only what the board sent: Chrome on macOS
 *     returned 14 bytes for the identity reply on a real F75, which is
 *     report ID + 7 header bytes + 6 identity bytes
 * A reply that does not start with the command, or is too short to hold
 * `length` data bytes, is refused.
 */
export function parseReply(raw: Uint8Array, cmd: number, length: number): Uint8Array {
  // `body` starts at the command byte, i.e. it is the frame without its report ID.
  const body = raw[0] === REPORT_ID && raw[1] === cmd ? raw.subarray(1) : raw[0] === cmd ? raw : null
  if (!body) {
    throw new Error(`reply does not answer command 0x${cmd.toString(16)}: starts ${toHex(raw.subarray(0, 8))}`)
  }
  const dataStart = HEADER_LENGTH - 1
  if (body.length < dataStart + length) {
    throw new Error(`reply carries ${Math.max(0, body.length - dataStart)} data bytes, expected ${length}`)
  }
  return body.slice(dataStart, dataStart + length)
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
