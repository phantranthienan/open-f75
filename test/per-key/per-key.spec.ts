import type { Page } from '@playwright/test'
import {
  BOARD,
  CONNECT_COMMANDS,
  READ_LIGHTING,
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

const PER_KEY_WRITE = 0x06
const SETTINGS_WRITE = 0x04
// Planes of 126 bytes: red, green, blue, each by LED index.
const R = 0
const G = 126
const B = 252
const LED = { Esc: 0, Q: 8, W: 14, E: 20, Space: 35 }

const key = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}: `) })
const sendKeys = (page: Page) => page.getByRole('button', { name: /^(Dry run key colours|Send key colours)$/ }).click()

async function written(page: Page, cmd: number, length: number) {
  const write = (await sent(page)).find((r) => r.data[0] === cmd)
  return write ? write.data.slice(7, 7 + length) : null
}

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

    await pickColor(page, '#ff0000')
    await key(page, 'Esc').click()
    await drag(page, 'Q', 'W', 'E')
    await pickColor(page, '#0000ff')
    await key(page, 'Space').click()
    await expect(key(page, 'W')).toHaveAccessibleName('W: #ff0000')
    await expect(page.getByText('5 of 81 lit')).toBeVisible()

    await sendKeys(page)
    await expect(page.getByText('Saved 5 key colour(s) and the per-key effect, and read them back.')).toBeVisible()
    // The driver's order: colours, then the settings page; then both read back.
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ_LIGHTING, PER_KEY_WRITE, SETTINGS_WRITE, 0x86, 0x84])

    const colors = (await written(page, PER_KEY_WRITE, 378))!
    for (const led of [LED.Esc, LED.Q, LED.W, LED.E]) expect([colors[R + led], colors[G + led], colors[B + led]]).toEqual([255, 0, 0])
    expect([colors[R + LED.Space], colors[G + LED.Space], colors[B + LED.Space]]).toEqual([0, 0, 255])
    expect(colors.filter((b) => b !== 0)).toHaveLength(5)

    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x09, 0x0a]) // 0x0b is 0x20 already
    expect([settings[0x09], settings[0x0a], settings[0x0b]]).toEqual([1, 21, 0x20])
    expect(await boardState(page)).toMatchObject({ settings, perKey: colors })
    await expect(page.getByText('board: Per-key')).toBeVisible()
  })

  test('starts from the colours stored on the board', async ({ page }) => {
    const perKey = new Array(378).fill(0)
    perKey[G + LED.Esc] = 0xff
    await openWithBoard(page, { perKey })
    await connectF75(page)

    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #00ff00')
    await expect(key(page, 'Q')).toHaveAccessibleName('Q: off')
    await expect(page.getByText('1 of 81 lit')).toBeVisible()
  })

  test('fill, erase, clear and back to the board', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await pickColor(page, '#00ff00')

    await page.getByRole('button', { name: 'Fill all' }).click()
    await expect(page.getByText('81 of 81 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Erase' }).click()
    await key(page, 'Esc').click()
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: off')
    await expect(page.getByText('80 of 81 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.getByText('0 of 81 lit')).toBeVisible()
    await page.getByRole('button', { name: 'Fill all' }).click()
    await page.getByRole('button', { name: "Board's colours" }).click()
    await expect(page.getByText('0 of 81 lit')).toBeVisible()
  })

  test('a key paints from the keyboard too', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await pickColor(page, '#123456')
    await key(page, 'Esc').focus()
    await page.keyboard.press('Enter')
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #123456')
  })

  test('a dry run of key colours writes nothing', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await key(page, 'Esc').click()
    await sendKeys(page)

    await expect(page.getByText(/^Dry run \(per-key colours \+ settings page\)/)).toBeVisible()
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ_LIGHTING])
    expect((await boardState(page)).perKey).toEqual(BOARD.perKey)
  })

  test('sending a lighting change keeps the painting in progress', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await pickColor(page, '#00ff00')
    await key(page, 'Esc').click()
    await sendColor(page) // Fixed on in green, from the lighting pane

    await expect(page.getByText('Saved Fixed on in #00ff00')).toBeVisible()
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #00ff00')
  })
})
