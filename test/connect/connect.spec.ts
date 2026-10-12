import { F87_IDENTITY, connect, connectF75, expect, openWithBoard, sent, test } from '@test/fixtures/app'

test.describe('connecting over WebHID', () => {
  test('identifies an F75 with a single identity read', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)

    const reports = await sent(page)
    expect(reports).toHaveLength(1)
    const [identity] = reports
    expect(identity).toMatchObject({ type: 'feature', reportId: 0x06 })
    expect(identity.data).toHaveLength(519)
    // 06 82 01 00 01 00 06 00, as AULA's driver and OpenRGB send it
    expect(identity.data.slice(0, 7)).toEqual([0x82, 0x01, 0x00, 0x01, 0x00, 0x06, 0x00])
    expect(identity.data.slice(7).every((b) => b === 0)).toBe(true)
    // report sizes come from the descriptor items
    await expect(page.getByRole('cell', { name: '0x06 · 519 B' })).toBeVisible()
  })

  for (const replyFormat of ['short-with-id', 'short', 'full', 'full-with-id'] as const) {
    test(`reads the identity from a ${replyFormat} reply`, async ({ page }) => {
      await openWithBoard(page, { replyFormat })
      await connectF75(page)
    })
  }

  test('says so when the identity read fails, and sends nothing else', async ({ page }) => {
    await openWithBoard(page, { identity: null })
    await connect(page)

    await expect(page.getByText(/^The identity read failed, so the app sends nothing else/)).toBeVisible()
    await expect(page.getByRole('log')).toContainText('Identity read failed: reply does not answer command 0x82')
    expect(await sent(page)).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'Back up config' })).toBeDisabled()
  })

  test('sends nothing beyond the identity read to another model', async ({ page }) => {
    await openWithBoard(page, { identity: F87_IDENTITY })
    await connect(page)

    await expect(page.getByText('AULA F87. Only the F75 is supported.')).toBeVisible()
    await expect(page.getByText(/^This board identifies as AULA F87, not an F75/)).toBeVisible()
    expect(await sent(page)).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'Back up config' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Dry run' })).toBeDisabled()
  })

  test('sends nothing at all to a board with another product ID', async ({ page }) => {
    await openWithBoard(page, { productId: 0xfa09 })
    await connect(page)

    await expect(page.getByText(/Device reports 0xFA09\. Wireless, another model, or bootloader/)).toBeVisible()
    expect(await sent(page)).toEqual([])
  })

  test('never connects on its own: not on page load, not when the board is plugged in', async ({ page }) => {
    await openWithBoard(page, { granted: true }) // Chrome remembers the board from an earlier visit
    await page.evaluate(() => window.__fakeHid.announce())
    await page.waitForTimeout(500)

    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
    expect(await sent(page)).toEqual([])
  })

  test('notices when the board is unplugged', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await page.evaluate(() => window.__fakeHid.unplug())

    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
    await expect(page.getByRole('log')).toContainText('Device disconnected')
  })

  test('explains that the browser has no WebHID, and offers no Connect', async ({ page }) => {
    await page.addInitScript(() => delete (Navigator.prototype as { hid?: unknown }).hid)
    await page.goto('/')
    await expect(page.getByText('WebHID is not available in this browser')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled()
  })

  test('a plug-in event while connected does not reopen the board', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await page.evaluate(() => window.__fakeHid.announce())
    await page.waitForTimeout(300)

    await expect(page.getByRole('log').getByText(/^Connected via WebHID/)).toHaveCount(1)
    expect(await sent(page)).toHaveLength(1)
  })
})
