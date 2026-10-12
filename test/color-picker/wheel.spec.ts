import { expect, test } from '@test/fixtures/app'

test.describe('colour wheel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('picks hue and saturation with the pointer', async ({ page }) => {
    const wheel = page.getByRole('slider', { name: 'Colour wheel' }).locator('..')
    const box = (await wheel.boundingBox())!

    await wheel.click({ position: { x: box.width / 2, y: box.height / 2 } }) // centre: no saturation
    await expect(page.getByLabel('Hex')).toHaveValue('#ffffff')

    await wheel.click({ position: { x: box.width / 2, y: 0 } }) // top edge: hue 0, full saturation
    await expect(page.getByLabel('Hex')).toHaveValue('#ff0000')
    await expect(page.getByText('rgb(255, 0, 0)')).toBeVisible()
  })

  test('works from the keyboard', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Colour wheel' })
    await slider.focus()

    await page.keyboard.press('Home')
    await expect(page.getByLabel('Hex')).toHaveValue('#ffffff')

    for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowUp') // saturation up to 100%
    await expect(page.getByLabel('Hex')).toHaveValue('#ff0000')

    await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuenow', '5')
    await expect(page.getByLabel('Hex')).not.toHaveValue('#ff0000')
  })

  test('follows a typed hex value', async ({ page }) => {
    await page.getByLabel('Hex').fill('#00ffff')
    await expect(page.getByRole('slider', { name: 'Colour wheel' })).toHaveAttribute('aria-valuenow', '180')
  })
})
