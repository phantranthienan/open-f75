import { expect, openWithBoard, test } from '@test/fixtures/app'

test.describe('top bar', () => {
  test('links to the source on GitHub, in a new tab', async ({ page }) => {
    await openWithBoard(page)
    const link = page.getByRole('link', { name: 'Source on GitHub' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://github.com/phantranthienan/open-f75')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
