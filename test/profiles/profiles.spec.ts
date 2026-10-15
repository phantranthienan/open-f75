import { readFile, writeFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  BOARD,
  WRITE,
  changedOffsets,
  connectF75,
  expect,
  keyOnMap as key,
  modeButton,
  openWithBoard,
  pickColor,
  selectEffect,
  sendColor,
  setDryRun,
  setMode,
  test,
  writtenPayload,
} from '@test/fixtures/app'

async function saveProfile(page: Page, name: string) {
  await page.getByLabel('Profile name').fill(name)
  await page.getByRole('button', { name: 'Save profile' }).click()
}

/** Breathing at brightness 3 in #123456, with Esc painted the same colour; saved in Effect mode. */
async function makeEvening(page: Page) {
  await setMode(page, 'Per-key')
  await pickColor(page, '#123456')
  await key(page, 'Esc').click()
  await setMode(page, 'Effect')
  await selectEffect(page, 'Breathing')
  const colorful = page.getByRole('switch', { name: 'Colourful' })
  if (await colorful.isChecked()) await colorful.click() // a connected board stores Breathing as colourful
  await page.getByLabel('Brightness').fill('3')
  await saveProfile(page, 'evening')
  await expect(page.getByText('Saved "evening".')).toBeVisible()
}

test.describe('profiles', () => {
  test('keep the lighting and key colours across reloads, and load them back', async ({ page }) => {
    await page.goto('/')
    await makeEvening(page)
    await expect(page.getByRole('button', { name: 'Load evening' })).toContainText('Breathing · 3/9 · #123456 · 1 key')

    await page.reload()
    await page.getByRole('button', { name: 'Load evening' }).click()
    await expect(page.getByLabel('Effect')).toHaveValue('2')
    await expect(page.getByLabel('Brightness')).toHaveValue('3')
    await expect(page.getByLabel('Hex')).toHaveValue('#123456')
    await setMode(page, 'Per-key')
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #123456')

    await page.getByRole('button', { name: 'Delete evening' }).click()
    await page.reload()
    await expect(page.getByText('No profiles yet.')).toBeVisible()
  })

  test('a profile saved in Per-key mode loads back into Per-key mode', async ({ page }) => {
    await page.goto('/')
    await setMode(page, 'Per-key')
    await pickColor(page, '#00ff00')
    await key(page, 'Esc').click()
    await saveProfile(page, 'keys')
    await expect(page.getByRole('button', { name: 'Load keys' })).toContainText('Per-key · 1 key')

    await setMode(page, 'Effect')
    await page.getByRole('button', { name: 'Load keys' }).click()
    await expect(modeButton(page, 'Per-key')).toHaveAttribute('aria-pressed', 'true')
    await expect(key(page, 'Esc')).toHaveAccessibleName('Esc: #00ff00')
  })

  test('export to a JSON file and import it again', async ({ page }, testInfo) => {
    await page.goto('/')
    await makeEvening(page)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export profiles' }).click(),
    ])
    const file = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(file).toMatchObject({ format: 'open-f75-profiles', version: 1 })
    expect(file.profiles).toEqual([
      { name: 'evening', effect: 2, brightness: 3, speed: 2, colorful: false, color: '#123456', keys: { 0: '#123456' } },
    ])

    await page.getByRole('button', { name: 'Delete evening' }).click()
    const path = testInfo.outputPath('profiles.json')
    await writeFile(path, JSON.stringify(file))
    await page.getByLabel('Profiles file to import').setInputFiles(path)
    await expect(page.getByText('Imported 1 profile(s) from profiles.json.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load evening' })).toBeVisible()
  })

  test('refuse a file that is not a profiles export', async ({ page }, testInfo) => {
    await page.goto('/')
    const path = testInfo.outputPath('backup.json')
    await writeFile(path, JSON.stringify({ format: 'open-f75-backup', version: 3 }))
    await page.getByLabel('Profiles file to import').setInputFiles(path)
    await expect(page.getByText('Import failed: This is not an open-f75 profiles file.')).toBeVisible()
  })

  test('a loaded profile is sent like any other choice', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await setDryRun(page, false)
    await makeEvening(page)
    await selectEffect(page, 'Fixed on')
    await page.getByRole('button', { name: 'Load evening' }).click()
    await sendColor(page)

    await expect(page.getByText('Saved Breathing in #123456')).toBeVisible()
    const settings = (await writtenPayload(page, WRITE.settings, 128))!
    expect(settings[0x0a]).toBe(2)
    expect(settings[0x3c]).toBe(3)
    expect(changedOffsets(BOARD.settings, settings)).toEqual([0x0a, 0x3c, 0x3d])
  })
})
