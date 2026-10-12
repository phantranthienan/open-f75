import { describe, expect, it } from 'vitest'
import { Keyboard } from './keyboard'
import { createLog } from './log'
import { createSafeSend } from './safe-send'
import { MOCK_DEVICE, MockTransport, type MockOptions } from './transports/mock'

async function setup({ dryRun = false, ...mock }: MockOptions & { dryRun?: boolean } = {}) {
  const transport = new MockTransport(mock)
  const device = await transport.connect()
  const log = createLog()
  const send = createSafeSend({ transport, log, isDryRun: () => dryRun })
  const keyboard = new Keyboard({ transport, send, log, device, readTimeoutMs: 200, echoTimeoutMs: 100 })
  const kinds = () => log.entries().map((e) => e.kind)
  return { transport, keyboard, log, kinds }
}

describe('Keyboard', () => {
  it('reads the 10 config frames', async () => {
    const { keyboard } = await setup()
    const config = await keyboard.readConfig()
    expect(config).toHaveLength(10)
    expect(config[0][15]).toBe(0x0b)
  })

  it('sets and saves a static colour', async () => {
    const { keyboard, transport, kinds } = await setup()
    await expect(keyboard.setStaticColor([0x12, 0x34, 0x56])).resolves.toBe('sent')
    expect(transport.state).toEqual({ effect: 1, color: [0x12, 0x34, 0x56], saves: 1 })
    expect(kinds().filter((k) => k === 'tx')).toHaveLength(1 + 48)
  })

  it('in dry run, reads the config but changes nothing', async () => {
    const { keyboard, transport, kinds } = await setup({ dryRun: true })
    await expect(keyboard.setStaticColor([0xff, 0, 0])).resolves.toBe('dry-run')
    expect(transport.state.saves).toBe(0)
    expect(kinds().filter((k) => k === 'tx')).toHaveLength(1)
    expect(kinds().filter((k) => k === 'dry')).toHaveLength(48)
  })

  it('stops at the first missing echo and never saves', async () => {
    const { keyboard, transport, kinds } = await setup({ echoLimit: 3 })
    await expect(keyboard.setStaticColor([0xff, 0, 0])).rejects.toThrow(/no echo/)
    expect(kinds().filter((k) => k === 'tx')).toHaveLength(1 + 4)
    expect(transport.state.saves).toBe(0)
  })

  it('refuses a second operation while one is running', async () => {
    const { keyboard } = await setup()
    const first = keyboard.setStaticColor([0, 0, 0xff])
    await expect(keyboard.readConfig()).rejects.toThrow(/still running/)
    await first
  })

  it('sends nothing to a device that fails the recon checks', async () => {
    const wireless = { ...MOCK_DEVICE, productId: 0xfa09 }
    const { keyboard, kinds } = await setup({ device: wireless })
    await expect(keyboard.setStaticColor([0xff, 0, 0])).rejects.toThrow(/recon checks/)
    await expect(keyboard.backup()).rejects.toThrow(/recon checks/)
    expect(kinds()).not.toContain('tx')
    expect(kinds()).not.toContain('rx')
  })

  it('backs up the config and every declared feature report', async () => {
    const { keyboard } = await setup()
    const backup = await keyboard.backup()
    expect(backup.config).toHaveLength(10)
    expect(backup.config?.[0]).toBe('13440a000e000303020000040407000b200100b2')
    expect(Object.keys(backup.featureReports)).toEqual(['0x06'])
  })
})
