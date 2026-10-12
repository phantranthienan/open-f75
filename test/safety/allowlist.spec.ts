import { expect, openWithBoard, sent, test } from '@test/fixtures/app'

/**
 * The second line of defence: even code that skips the guard (safe-send.ts)
 * and calls the WebHID transport directly cannot send anything off the
 * allowlist. The build already refuses such code (scripts/raw-sends.mjs);
 * this checks what happens at runtime if some got through anyway.
 */
test('the WebHID transport refuses packets off the allowlist, even with the guard bypassed', async ({ page }) => {
  await openWithBoard(page)

  const results = await page.evaluate(async () => {
    const url = '/src/transports/webhid.ts'
    const { WebHidTransport } = await import(/* @vite-ignore */ url)
    const transport = new WebHidTransport()
    await transport.connect()

    const frame = (cmd: number, param: number, length: number, payload: number[] = []) => {
      const f = new Uint8Array(519) // without the report ID
      f.set([cmd, param, 0, 1, 0, length & 0xff, length >> 8])
      f.set(payload, 7)
      return f
    }
    const attempts: [string, 'feature' | 'output', number, Uint8Array][] = [
      ['factory reset', 'feature', 0x06, frame(0x11, 0, 1, [1])],
      ['key matrix write', 'feature', 0x06, frame(0x03, 0, 512)],
      ['macro write', 'feature', 0x06, frame(0x05, 0, 16)],
      ['direct LED frame', 'feature', 0x06, frame(0x08, 0, 378)],
      ['unknown command', 'feature', 0x06, frame(0x7f, 0, 0)],
      ['settings page without its end marker', 'feature', 0x06, frame(0x04, 0, 128)],
      ['dongle frame', 'output', 0x13, new Uint8Array(19)],
      // AULA's firmware updater (Update.exe, decompiled): report 0x05 is the bootloader's door.
      ['enter bootloader', 'feature', 0x05, Uint8Array.from([0x75, 0, 0, 0, 0])],
      ['bootloader erase', 'feature', 0x05, new Uint8Array(5).fill(0x45)],
      ['bootloader burn', 'feature', 0x05, new Uint8Array(5).fill(0x55)],
      ['bootloader data block', 'feature', 0x06, Uint8Array.from({ length: 2049 }, (_, i) => (i === 0 ? 0x77 : 0))],
    ]
    const outcome: Record<string, string> = {}
    for (const [name, type, reportId, data] of attempts) {
      try {
        await transport.send(type, reportId, data)
        outcome[name] = 'sent'
      } catch (err) {
        outcome[name] = (err as Error).name
      }
    }
    // control: an allowlisted packet still goes through
    await transport.send('feature', 0x06, frame(0x82, 0x01, 6))
    return outcome
  })

  for (const [name, result] of Object.entries(results)) expect(result, name).toBe('BlockedPacketError')
  const reports = await sent(page)
  expect(reports).toHaveLength(1)
  expect(reports[0].data[0]).toBe(0x82)
})
