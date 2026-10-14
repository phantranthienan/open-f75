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
  selectEffect,
  sendColor,
  sent,
  setDryRun,
  test,
} from '@test/fixtures/app'
import type { Page } from '@playwright/test'

const SETTINGS_WRITE = 0x04
const COLOR_TABLE_WRITE = 0x0a
const payloadOf = (data: number[], length: number) => data.slice(7, 7 + length)

async function written(page: Page, cmd: number, length: number) {
  const write = (await sent(page)).find((r) => r.data[0] === cmd)
  return write ? payloadOf(write.data, length) : null
}

/** Connected to the owner's board (Fixed on, white, brightness 7) with dry run off. */
async function live(page: Page, board = {}) {
  await openWithBoard(page, board)
  await connectF75(page)
  await setDryRun(page, false)
}

test.describe('lighting', () => {
  test('starts from what the board shows', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)

    await expect(page.getByText('board: Fixed on · 7/9')).toBeVisible()
    await expect(page.getByLabel('Effect')).toHaveValue('1')
    await expect(page.getByLabel('Brightness')).toHaveValue('7')
    await expect(page.getByLabel('Speed')).toBeDisabled() // Fixed on has no speed in AULA's profile
    await expect(page.getByLabel('Hex')).toHaveValue('#ffffff')
    await expect(page.getByRole('switch', { name: 'Colourful' })).not.toBeChecked()
    expect(await commands(page)).toEqual(CONNECT_COMMANDS)
  })

  test("another effect starts from that effect's own values on the board, and only what changed is written", async ({ page }) => {
    await live(page)
    await selectEffect(page, 'Breathing') // slot 1, 0x3c..0x3d = 09 47: brightness 9, speed 4, colourful
    await expect(page.getByLabel('Brightness')).toHaveValue('9')
    await expect(page.getByLabel('Speed')).toHaveValue('4')
    await expect(page.getByRole('switch', { name: 'Colourful' })).toBeChecked()

    await page.getByLabel('Brightness').fill('5')
    await page.getByLabel('Speed').fill('2')
    await sendColor(page)

    await expect(page.getByText('Saved Breathing, colourful (settings page only)')).toBeVisible()
    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a, 0x3c, 0x3d])
    expect([settings[0x0a], settings[0x3c], settings[0x3d]]).toEqual([2, 5, 0x27])
    expect(await written(page, COLOR_TABLE_WRITE, 512)).toBeNull()
    expect((await boardState(page)).settings).toEqual(settings)
  })

  test("an effect in a custom colour gets it in slot 0 of its own colour-table row", async ({ page }) => {
    await live(page)
    await selectEffect(page, 'Raindrops') // value 5: row 5 at offset 105, slot 4 at 0x42..0x43
    await page.getByRole('switch', { name: 'Colourful' }).click()
    await pickColor(page, '#123456')
    await sendColor(page)

    await expect(page.getByText('Saved Raindrops in #123456 (custom colour, colour table + settings page)')).toBeVisible()
    const table = (await written(page, COLOR_TABLE_WRITE, 512))!
    expect(changedOffsets(BOARD.colorTable, table)).toEqual([105, 106, 107])
    expect(table.slice(105, 108)).toEqual([0x12, 0x34, 0x56])
    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a, 0x43])
    expect([settings[0x0a], settings[0x43]]).toEqual([5, 0x40]) // speed 4 kept, colour slot 0
  })

  test('an effect without a colour changes only the controls it has', async ({ page }) => {
    await live(page)
    await selectEffect(page, 'Rainbow') // value 3, slot 2 at 0x3e..0x3f = 09 47
    await expect(page.getByRole('switch', { name: 'Colourful' })).toHaveCount(0)
    await expect(page.getByText('Rainbow has no colour setting')).toBeVisible()
    await page.getByLabel('Speed').fill('1')
    await sendColor(page)

    await expect(page.getByText('Saved Rainbow (settings page only)')).toBeVisible()
    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a, 0x3f])
    expect(settings[0x3f]).toBe(0x17) // speed 1, the board's colour nibble kept
  })

  test('a colourful-only effect switched off uses its own colours, as AULA\'s driver writes it', async ({ page }) => {
    await live(page)
    await selectEffect(page, 'Shadow disappear') // value 9, slot 8 at 0x4a..0x4b; no colour row in AULA's driver
    await page.getByRole('switch', { name: 'Colourful' }).click()
    await sendColor(page)

    await expect(page.getByText('Saved Shadow disappear (settings page only)')).toBeVisible()
    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a, 0x4b])
    expect(settings[0x4b]).toBe(0x40)
  })

  test('off writes the effect byte only', async ({ page }) => {
    await live(page)
    await selectEffect(page, 'Off')
    await expect(page.getByLabel('Brightness')).toBeDisabled()
    await sendColor(page)

    await expect(page.getByText('Saved Off (settings page only)')).toBeVisible()
    const settings = (await written(page, SETTINGS_WRITE, 128))!
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a])
    expect(settings[0x0a]).toBe(0)
  })

  test('Read board picks up a change made on the keyboard itself', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    const changed = [...BOARD.settings]
    changed[0x0a] = 2 // Breathing
    changed[0x3c] = 3 // its brightness
    await page.evaluate((s) => window.__fakeHid.setSettings(s), changed)
    await page.getByRole('button', { name: 'Read board' }).click()

    await expect(page.getByText('board: Breathing · 3/9')).toBeVisible()
    await expect(page.getByLabel('Effect')).toHaveValue('2')
    await expect(page.getByLabel('Brightness')).toHaveValue('3')
    expect(await commands(page)).toEqual([...CONNECT_COMMANDS, ...READ_LIGHTING])
  })
})
