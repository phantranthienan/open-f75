import { describe, expect, it } from 'vitest'
import { Keyboard } from './keyboard'
import { createLog } from './log'
import { toHex } from './protocol/bytes'
import { FIXED_ON, colorRow } from './protocol/settings'
import { createSafeSend } from './safe-send'
import { MOCK_DEVICE, MockTransport, type MockOptions } from './transports/mock'

const F87_IDENTITY = [0x03, 0, 0, 0, 0x00, 0x8f]

async function setup({ dryRun = false, identify = true, ...mock }: MockOptions & { dryRun?: boolean; identify?: boolean } = {}) {
  const transport = new MockTransport(mock)
  const device = await transport.connect()
  const log = createLog()
  const send = createSafeSend({ transport, log, isDryRun: () => dryRun })
  const keyboard = new Keyboard({ transport, send, log, device, delayMs: 0 })
  if (identify) await keyboard.identify()
  const kinds = (kind: string) => log.entries().filter((e) => e.kind === kind)
  return { transport, keyboard, log, kinds }
}

describe('identify', () => {
  it('reads the identity and unlocks the board', async () => {
    const { keyboard } = await setup()
    expect(keyboard.identity).toMatchObject({ status: 'read' })
    expect(keyboard.assessment.canSend).toBe(true)
  })

  it.each([false, true])('accepts replies with and without the report ID (prefixed: %s)', async (replyWithReportId) => {
    const { keyboard } = await setup({ replyWithReportId })
    expect(keyboard.assessment.canSend).toBe(true)
  })

  it('locks out other models that share the USB IDs', async () => {
    const { keyboard, kinds } = await setup({ identity: F87_IDENTITY })
    expect(keyboard.assessment.canSend).toBe(false)
    await expect(keyboard.setStaticColor([0, 255, 0])).rejects.toThrow(/not identified as an AULA F75/)
    await expect(keyboard.backup()).rejects.toThrow(/not identified as an AULA F75/)
    expect(kinds('tx').map((e) => e.text)).toEqual(['identity read'])
  })

  it('sends nothing at all to a device that fails the descriptor checks', async () => {
    const { keyboard, kinds } = await setup({ device: { ...MOCK_DEVICE, productId: 0xfa09 }, identify: false })
    await expect(keyboard.identify()).rejects.toThrow(/descriptor checks/)
    expect(kinds('tx')).toHaveLength(0)
  })

  it('needs the identity before any other read', async () => {
    const { keyboard, kinds } = await setup({ identify: false })
    await expect(keyboard.readSettings()).rejects.toThrow(/not identified/)
    expect(kinds('tx')).toHaveLength(0)
  })
})

describe('setStaticColor', () => {
  it('selects a firmware colour with one settings write, then reads it back', async () => {
    const { keyboard, transport, kinds } = await setup()
    const { result, plan } = await keyboard.setStaticColor([0, 255, 0])
    expect(result).toBe('sent')
    expect(plan.custom).toBe(false)
    expect(transport.state.board).toMatchObject({ effect: FIXED_ON, color: [0, 255, 0] })
    expect(kinds('tx').map((e) => e.text)).toEqual([
      'identity read',
      'settings read',
      'colour table read',
      'settings write',
      'settings read',
    ])
  })

  it('writes a custom colour to the colour table and selects it', async () => {
    const { keyboard, transport, kinds } = await setup()
    const { result, plan } = await keyboard.setStaticColor([0x12, 0x34, 0x56])
    expect(result).toBe('sent')
    expect(plan.custom).toBe(true)
    expect(colorRow(transport.state.colorTable, FIXED_ON)[0]).toEqual([0x12, 0x34, 0x56])
    expect(transport.state.board.color).toEqual([0x12, 0x34, 0x56])
    expect(kinds('tx').map((e) => e.text)).toContain('colour table write')
  })

  it('writes nothing when the board already shows the colour', async () => {
    const { keyboard, transport } = await setup()
    await expect(keyboard.setStaticColor([255, 0, 0])).resolves.toMatchObject({ result: 'unchanged' })
    expect(transport.state.writes).toBe(0)
  })

  it('in dry run, reads for real but writes nothing', async () => {
    const { keyboard, transport, kinds } = await setup({ dryRun: true })
    await expect(keyboard.setStaticColor([0x12, 0x34, 0x56])).resolves.toMatchObject({ result: 'dry-run' })
    expect(transport.state.writes).toBe(0)
    expect(kinds('dry').map((e) => e.text)).toEqual(['colour table write', 'settings write'])
  })

  it('reports a board that ignores the write', async () => {
    const { keyboard } = await setup({ ignoreWrites: true })
    await expect(keyboard.setStaticColor([0, 255, 0])).rejects.toThrow(/did not keep the write: settings 0x3b reads 0x40/)
  })

  it('refuses a custom colour when the board has no table in the expected layout', async () => {
    const { keyboard, transport } = await setup({ colorTable: new Uint8Array(512) })
    await expect(keyboard.setStaticColor([0x12, 0x34, 0x56])).rejects.toThrow(/7 firmware colours/)
    expect(transport.state.writes).toBe(0)
  })

  it('refuses a second operation while one is running', async () => {
    const { keyboard } = await setup()
    const first = keyboard.setStaticColor([0, 0, 255])
    await expect(keyboard.readSettings()).rejects.toThrow(/still running/)
    await first
  })
})

describe('backup', () => {
  it('saves identity, settings page and colour table', async () => {
    const { keyboard, transport } = await setup()
    const backup = await keyboard.backup()
    expect(backup.identity).toBe('0300000000cd')
    expect(backup.settings).toBe(toHex(transport.state.settings, ''))
    expect(backup.colorTable).toBe(toHex(transport.state.colorTable, ''))
    expect(backup.errors).toEqual({})
  })
})
