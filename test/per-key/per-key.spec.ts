import type { Page } from '@playwright/test'
import {
  BLANK_PER_KEY,
  BOARD,
  CONNECT_COMMANDS,
  READ,
  WRITE,
  boardState,
  changedOffsets,
  commands,
  connectF75,
  expect,
  keyOnMap as key,
  modeButton,
  openWithBoard,
  pickColor,
  sendColor,
  sendKeyColors,
  setDryRun,
  setMode,
  test,
  writtenPayload,
} from '@test/fixtures/app'

// Planes of 126 bytes: red, green, blue, each by LED index.
const R = 0
const G = 126
const B = 252
const LED = { Esc: 0, Q: 8, W: 14, E: 20, Space: 35 }

async function drag(page: Page, from: string, ...through: string[]) {
  const centre = async (name: string) => {
    const box = (await key(page, name).boundingBox())!
    return [box.x + box.width / 2, box.y + box.height / 2] as const
  }
  await page.mouse.move(...(await centre(from)))
  await page.mouse.down()
  for (const name of through) await page.mouse.move(...(await centre(name)), { steps: 4 })
  await page.mouse.up()
}

test.describe('per-key colours', () => {
  test('paints with a click and a drag, and sends the colours with the per-key effect', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await setMode(page, 'Per-key')

    await pickColor(page, '#ff0000')
    await key(page, 'Esc').click()
    await drag(page, 'Q', 'W', 'E')
    await pickColor(page, '#0000ff')
    await key(page, 'Space').click()
    await expect(key(page, 'W')).toHaveAccessibleName('W: #ff0000')
    await expect(page.getByText('5 of 80 lit')).toBeVisible()

    await sendKeyColors(page)
    await expect(page.getByText('Saved the per-key effect with 5 key(s) lit (per-key colours + settings page) and read it back.')).toBeVisible()
    // The driver's order: colours, then the settings page; then both read back.
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ.perKey, WRITE.perKey, WRITE.settings, 0x86, 0x84])

    const colors = (await writtenPayload(page, WRITE.perKey, 378))!
    for (const led of [LED.Esc, LED.Q, LED.W, LED.E]) expect([colors[R + led], colors[G + led], colors[B + led]]).toEqual([255, 0, 0])
    expect([colors[R + LED.Space], colors[G + LED.Space], colors[B + LED.Space]]).toEqual([0, 0, 255])
    expect(colors.filter((b) => b !== 0)).toHaveLength(5)

    const settings = (await writtenPayload(page, WRITE.settings, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x09, 0x0a]) // 0x0b is 0x20 already
    expect([settings[0x09], settings[0x0a], settings[0x0b]]).toEqual([1, 21, 0x20])
    expect(await boardState(page)).toMatchObject({ settings, perKey: colors })
    await expect(page.getByText('board: Per-key')).toBeVisible()
  })

  test('the map is the US layout: \\ on the Q row, one-row Enter, Fn and Ctrl after the space bar', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await setMode(page, 'Per-key')
    await expect(page.getByRole('button', { name: /^ISO/ })).toHaveCount(0)
    await expect(page.getByText('0 of 80 lit')).toBeVisible()

    await pickColor(page, '#ff0000')
    for (const name of ['\\', 'Enter', 'Fn', 'RCtrl']) await key(page, name).click()
    await sendKeyColors(page)

    await expect(page.getByText(/^Saved the per-key effect with 4 key\(s\) lit/)).toBeVisible()
    const colors = (await writtenPayload(page, WRITE.perKey, 378))!
    // OpenRGB's AULA F75 layout: \ 80, Enter 81, Fn 53, right Ctrl 59.
    expect(colors.slice(R, R + 126).flatMap((v, led) => (v ? [led] : []))).toEqual([53, 59, 80, 81])
  })

  test('starts from the colours stored on the board', async ({ page }) => {
    const perKey = [...BLANK_PER_KEY]
    perKey[G + LED.Esc] = 0xff
    await openWithBoard(page, { perKey })
    await connectF75(page)
    await setMode(page, 'Per-key')

    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #00ff00')
    await expect(key(page, 'Q')).toHaveAccessibleName('Q: off')
    await expect(page.getByText('1 of 80 lit')).toBeVisible()
  })

  test('fill, erase, clear and back to the board', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setMode(page, 'Per-key')
    await pickColor(page, '#00ff00')

    await page.getByRole('button', { name: 'Fill all' }).click()
    await expect(page.getByText('80 of 80 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Erase' }).click()
    await key(page, 'Esc').click()
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: off')
    await expect(page.getByText('79 of 80 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.getByText('0 of 80 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Fill all' }).click()
    await page.getByRole('button', { name: "Board's colours" }).click()
    await expect(page.getByText('0 of 80 lit')).toBeVisible()
  })

  test('a key paints from the keyboard too', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setMode(page, 'Per-key')
    await pickColor(page, '#123456')
    await key(page, 'Esc').focus()
    await page.keyboard.press('Enter')
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #123456')
  })

  test('a dry run of key colours writes nothing', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setMode(page, 'Per-key')
    await key(page, 'Esc').click()
    await sendKeyColors(page)

    await expect(page.getByText(/^Dry run \(per-key colours \+ settings page\)/)).toBeVisible()
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ.perKey])
    expect((await boardState(page)).perKey).toEqual(BOARD.perKey)
  })

  test('a board on the per-key effect opens Per-key mode, and switching mode sends nothing', async ({ page }) => {
    const settings = [...BOARD.settings]
    settings[0x09] = 1
    settings[0x0a] = 21
    await openWithBoard(page, { settings })
    await connectF75(page)
    await expect(modeButton(page, 'Per-key')).toHaveAttribute('aria-pressed', 'true')

    await setMode(page, 'Effect')
    await expect(page.getByLabel('Effect')).toHaveValue('1') // per-key isn't in the list; Effect mode edits Fixed on
    await expect(page.getByLabel('Effect').getByRole('option', { name: 'Per-key' })).toHaveCount(0)
    await setMode(page, 'Per-key')
    expect(await commands(page)).toEqual(CONNECT_COMMANDS)
  })

  test('after the key colours, Effect mode switches the whole board back to a colour', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await setMode(page, 'Per-key')
    await pickColor(page, '#ff0000')
    await key(page, 'Esc').click()
    await expect(page.getByText('Send switches the board from Fixed on to your key colours · per-key colours + settings page')).toBeVisible()
    await sendKeyColors(page)
    await expect(page.getByText('board: Per-key')).toBeVisible()

    await setMode(page, 'Effect')
    await pickColor(page, '#00ff00')
    await expect(page.getByText('Send switches the board from your key colours to Fixed on · firmware colour, settings page only')).toBeVisible()
    await sendColor(page)

    await expect(page.getByText('Saved Fixed on in #00ff00')).toBeVisible()
    const { settings, perKey } = await boardState(page)
    expect([settings[0x09], settings[0x0a]]).toEqual([0, 1])
    expect(perKey[R + LED.Esc]).toBe(255) // the key colours stay stored for the next per-key Send
    await expect(page.getByText('board: Fixed on')).toBeVisible()
    await expect(modeButton(page, 'Effect')).toHaveAttribute('aria-pressed', 'true')
  })

  test('sending a whole-board effect keeps the painting in progress', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await setMode(page, 'Per-key')
    await pickColor(page, '#00ff00')
    await key(page, 'Esc').click()
    await setMode(page, 'Effect')
    await sendColor(page) // Fixed on in green

    await expect(page.getByText('Saved Fixed on in #00ff00')).toBeVisible()
    await setMode(page, 'Per-key')
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #00ff00')
  })
})
