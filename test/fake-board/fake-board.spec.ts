import { expect, test } from '@test/fixtures/app'

/** npm run dev:fake: the real app against the fake board, no openWithBoard needed. */
test('the fake-board page runs the app against the fake F75', async ({ page }) => {
  await page.goto('/test/fake-board/')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('This is an F75.')).toBeVisible()
  await expect(page.getByText('Fake F75 (no hardware) · 258a:010c')).toBeVisible()
  await expect(page.getByText('board: Fixed on · 7/9')).toBeVisible()
})
