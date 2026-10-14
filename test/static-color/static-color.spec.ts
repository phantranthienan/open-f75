import {
  BOARD,
  boardState,
  changedOffsets,
  commands,
  connectF75,
  expect,
  openWithBoard,
  pickColor,
  sendColor,
  sent,
  setDryRun,
  test,
} from '@test/fixtures/app'

const SETTINGS_WRITE = 0x04
const COLOR_TABLE_WRITE = 0x0a
const payloadOf = (data: number[], length: number) => data.slice(7, 7 + length)

test.describe('static colour over WebHID', () => {
  test('a dry run reads for real and writes nothing', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await pickColor(page, '#00ff00')
    await sendColor(page) // dry run is on at every page load

    await expect(page.getByText(/^Dry run \(firmware colour/)).toBeVisible()
    await expect(page.getByRole('log')).toContainText('settings 0x3b: 0x46 -> 0x41')
    expect(await commands(page)).toEqual([0x82, 0x84, 0x8a])
    expect(await boardState(page)).toEqual({ settings: BOARD.settings, colorTable: BOARD.colorTable })
  })

  test('a firmware colour changes one settings byte and is read back', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#00ff00')
    await sendColor(page)

    await expect(page.getByText('Saved #00ff00 (firmware colour')).toBeVisible()
    expect(await commands(page)).toEqual([0x82, 0x84, 0x8a, SETTINGS_WRITE, 0x84])

    const write = (await sent(page)).find((r) => r.data[0] === SETTINGS_WRITE)!
    const written = payloadOf(write.data, 128)
    // 0x3b is the byte Fn+Tab moved on a real F75 (AulaSofwareLinux): speed 4, colour 1 = green
    expect(changedOffsets(BOARD.settings, written)).toEqual([0x3b])
    expect(written[0x3b]).toBe(0x41)
    expect(write.data.slice(7 + 128).every((b) => b === 0)).toBe(true)
    expect((await boardState(page)).settings).toEqual(written)
  })

  test('a custom colour goes into colour table row 1, slot 0', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#123456')
    await sendColor(page)

    await expect(page.getByText('Saved #123456 (custom colour')).toBeVisible()
    expect(await commands(page)).toEqual([0x82, 0x84, 0x8a, COLOR_TABLE_WRITE, SETTINGS_WRITE, 0x8a, 0x84])

    const tableWrite = (await sent(page)).find((r) => r.data[0] === COLOR_TABLE_WRITE)!
    const table = payloadOf(tableWrite.data, 512)
    expect(changedOffsets(BOARD.colorTable, table)).toEqual([21, 22, 23])
    expect(table.slice(21, 24)).toEqual([0x12, 0x34, 0x56])
    expect((await boardState(page)).colorTable).toEqual(table)
  })

  test("leaving the per-key effect clears its flag, as AULA's driver does", async ({ page }) => {
    // The board as AULA's driver leaves it on the per-key effect: 0x09 = 1, 0x0a = 21.
    const perKey = [...BOARD.settings]
    perKey[0x09] = 1
    perKey[0x0a] = 21
    await openWithBoard(page, { settings: perKey })
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#00ff00')
    await sendColor(page)

    await expect(page.getByText('Saved #00ff00 (firmware colour')).toBeVisible()
    const write = (await sent(page)).find((r) => r.data[0] === SETTINGS_WRITE)!
    const written = payloadOf(write.data, 128)
    expect(changedOffsets(perKey, written)).toEqual([0x09, 0x0a, 0x3b])
    expect([written[0x09], written[0x0a], written[0x3b]]).toEqual([0, 1, 0x41])
    expect((await boardState(page)).settings).toEqual(written)
  })

  test('nothing is written when the board already shows the colour', async ({ page }) => {
    // The owner's board shows white as colour 6, and slot 0 holds white too.
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#ffffff')
    await sendColor(page)

    await expect(page.getByText('The board already shows #ffffff on Fixed on. Nothing was written.')).toBeVisible()
    expect(await commands(page)).toEqual([0x82, 0x84, 0x8a])
  })

  test('reports a board that does not keep the write', async ({ page }) => {
    await openWithBoard(page, { ignoreWrites: true })
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#00ff00')
    await sendColor(page)

    await expect(page.getByText('Stopped: The board did not keep the write: settings 0x3b reads 0x46')).toBeVisible()
  })

  test('refuses a custom colour when the colour table has another layout', async ({ page }) => {
    await openWithBoard(page, { colorTable: new Array(512).fill(0) })
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#123456')
    await sendColor(page)

    await expect(page.getByText(/^Stopped: Custom colours need/)).toBeVisible()
    expect(await commands(page)).toEqual([0x82, 0x84, 0x8a])
  })
})
