import { describe, expect, it } from 'vitest'
import direct from '../../test/golden/f87-wired-direct.json'
import { fromHex, toHex } from './bytes'
import {
  Cmd,
  DATA_LENGTH,
  REPORT_LENGTH,
  buildIdentityRequest,
  buildReadRequest,
  buildWrite,
  compactHex,
  normalizeReply,
  parseHeader,
  parseReply,
} from './wired'

describe('framing', () => {
  it('builds the identity request byte for byte as AULA\'s driver and OpenRGB do', () => {
    const frame = buildIdentityRequest()
    expect(frame).toHaveLength(REPORT_LENGTH)
    // [ASL] proto.rs test "password_request_matches_the_disassembly"; [ORGB] {06 82 01 00 01 00 06}
    expect(toHex(frame.subarray(0, 8))).toBe('06 82 01 00 01 00 06 00')
    expect(frame.subarray(8).every((b) => b === 0)).toBe(true)
  })

  it('asks for the 128-byte settings page with 0x84', () => {
    expect(toHex(buildReadRequest(Cmd.GetSettings, 0, 128).subarray(0, 8))).toBe('06 84 00 00 01 00 80 00')
  })

  it('puts a write payload after the header and zero-pads to 520 bytes', () => {
    const frame = buildWrite(Cmd.SetSettings, 0, Uint8Array.of(0xaa, 0xbb))
    expect(toHex(frame.subarray(0, 10))).toBe('06 04 00 00 01 00 02 00 aa bb')
    expect(frame.subarray(10).every((b) => b === 0)).toBe(true)
  })

  it('refuses payloads that need more than one package', () => {
    expect(() => buildWrite(Cmd.SetColorTable, 0, new Uint8Array(513))).toThrow(RangeError)
  })

  it("reads the OEM app's wired frames with the same header layout", () => {
    // 01 00 7a 01: one package, index 0, 378 bytes = 126 LEDs x 3
    for (const { hex } of direct.frames) {
      const frame = fromHex(hex)
      expect(frame).toHaveLength(REPORT_LENGTH)
      expect(parseHeader(frame)).toEqual({ cmd: 0x08, param: 0, reserved: 0, packages: 1, index: 0, length: 378 })
    }
  })
})

describe('replies', () => {
  const reply = new Uint8Array(REPORT_LENGTH)
  reply.set([0x06, 0x82, 0x01, 0x00, 0x01, 0x00, 0x06, 0x00, 0x03, 0, 0, 0, 0, 0xcd])

  it('accepts a 520-byte reply that starts with the report ID', () => {
    expect(toHex(parseReply(reply, Cmd.GetInfo, 6))).toBe('03 00 00 00 00 cd')
  })

  it('accepts a 519-byte reply without it', () => {
    expect(toHex(parseReply(reply.slice(1), Cmd.GetInfo, 6))).toBe('03 00 00 00 00 cd')
    expect(normalizeReply(reply.slice(1))).toEqual(reply)
  })

  it('rejects a reply to another command', () => {
    expect(() => parseReply(reply, Cmd.GetSettings, 128)).toThrow(/command 0x82/)
  })

  it('rejects odd lengths', () => {
    expect(() => normalizeReply(new Uint8Array(64))).toThrow(/64 bytes/)
  })

  it('logs replies with their data and requests without padding', () => {
    expect(compactHex(reply, true)).toBe('06 82 01 00 01 00 06 00 03 00 00 00 00 cd')
    expect(compactHex(buildIdentityRequest())).toBe('06 82 01 00 01 00 06 00')
    expect(DATA_LENGTH).toBe(519)
  })
})
