import { expect, pickColor, test } from '@test/fixtures/app'

const save = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Save colour' }).click()

test.describe('saved colours', () => {
  test('are kept in this browser across reloads, and can be picked and removed', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Nothing saved yet.')).toBeVisible()

    await pickColor(page, '#123456')
    await save(page)
    await pickColor(page, '#abcdef')
    await save(page)
    await save(page) // saving the same colour twice keeps one entry

    await page.reload()
    const saved = page.getByRole('button', { name: /^Use #/ })
    await expect(saved).toHaveText(['#abcdef', '#123456']) // newest first

    await page.getByRole('button', { name: 'Use #123456' }).click()
    await expect(page.getByLabel('Hex')).toHaveValue('#123456')

    await page.getByRole('button', { name: 'Remove #123456' }).click()
    await page.reload()
    await expect(saved).toHaveText(['#abcdef'])
  })

  test('keeps the 16 newest', async ({ page }) => {
    await page.goto('/')
    for (let i = 1; i <= 17; i++) {
      await pickColor(page, `#0000${i.toString(16).padStart(2, '0')}`)
      await save(page)
    }
    await expect(page.getByRole('button', { name: /^Use #/ })).toHaveCount(16)
    await expect(page.getByRole('button', { name: 'Use #000011' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use #000001' })).toHaveCount(0)
  })

  test('still work for the visit when storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
    })
    await page.goto('/')
    await pickColor(page, '#123456')
    await save(page)
    await expect(page.getByRole('button', { name: 'Use #123456' })).toBeVisible()
  })
})
