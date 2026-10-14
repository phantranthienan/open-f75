import { readFile } from 'node:fs/promises'
import { BOARD, CONNECT_COMMANDS, F87_IDENTITY, READ, commands, connect, connectF75, expect, openWithBoard, test } from '@test/fixtures/app'

const hex = (bytes: number[]) => Buffer.from(bytes).toString('hex')

test.describe('backup', () => {
  test('downloads the identity, settings page, colour table and per-key colours, using reads only', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Back up config' }).click(),
    ])

    const backup = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(backup).toMatchObject({ format: 'open-f75-backup', version: 3, identity: '0300000000cd', errors: {} })
    expect(backup.settings).toBe(hex(BOARD.settings))
    expect(backup.colorTable).toBe(hex(BOARD.colorTable))
    expect(backup.perKey).toBe(hex(BOARD.perKey))
    expect(download.suggestedFilename()).toMatch(/^open-f75-backup-\d{8}-\d{6}\.json$/)
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ.board])
  })

  test('is not offered for a board that is not an F75', async ({ page }) => {
    await openWithBoard(page, { identity: F87_IDENTITY })
    await connect(page)
    await expect(page.getByRole('button', { name: 'Back up config' })).toBeDisabled()
  })
})
