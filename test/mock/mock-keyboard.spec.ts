import { connectF75, expect, pickColor, sendColor, setDryRun, test } from '@test/fixtures/app'

test('the mock keyboard runs the whole flow without hardware', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('switch', { name: 'Mock keyboard' }).click()
  await connectF75(page)

  // the mock's Device card is parsed from the real F75 report descriptor
  await expect(page.getByRole('cell', { name: '0x05 · 5 B' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '0x06 · 519 B' })).toBeVisible()

  await setDryRun(page, false)
  await pickColor(page, '#00ff00')
  await sendColor(page)
  await expect(page.getByText('Mock board: effect 1, #00ff00')).toBeVisible()

  await pickColor(page, '#123456')
  await sendColor(page)
  await expect(page.getByText('Mock board: effect 1, #123456')).toBeVisible()
})
