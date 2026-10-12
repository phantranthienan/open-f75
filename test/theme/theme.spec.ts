import type { Page } from '@playwright/test'
import { expect, test } from '@test/fixtures/app'

const BACKGROUND = {
  'tokyo-night': 'rgb(26, 27, 38)',
  'catppuccin-mocha': 'rgb(30, 30, 46)',
  'rose-pine': 'rgb(25, 23, 36)',
}

const pageTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const themeButton = (page: Page, name: string) => page.getByRole('group', { name: 'Theme' }).getByRole('button', { name })

test.describe('theme', () => {
  test('starts on Tokyo Night', async ({ page }) => {
    await page.goto('/')
    await expect(themeButton(page, 'Tokyo Night')).toHaveAttribute('aria-pressed', 'true')
    await expect(themeButton(page, 'Catppuccin Mocha')).toHaveAttribute('aria-pressed', 'false')
    expect(await pageTheme(page)).toBe('tokyo-night')
    expect(await bodyBackground(page)).toBe(BACKGROUND['tokyo-night'])
  })

  test('switches the whole page and is kept across reloads', async ({ page }) => {
    await page.goto('/')
    await themeButton(page, 'Rosé Pine').click()
    await expect(themeButton(page, 'Rosé Pine')).toHaveAttribute('aria-pressed', 'true')
    expect(await bodyBackground(page)).toBe(BACKGROUND['rose-pine'])
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#191724')

    await themeButton(page, 'Catppuccin Mocha').click()
    expect(await bodyBackground(page)).toBe(BACKGROUND['catppuccin-mocha'])

    await page.reload()
    await expect(themeButton(page, 'Catppuccin Mocha')).toHaveAttribute('aria-pressed', 'true')
    expect(await pageTheme(page)).toBe('catppuccin-mocha')
  })

  test('each swatch shows its own theme, whatever the page theme is', async ({ page }) => {
    await page.goto('/')
    await themeButton(page, 'Catppuccin Mocha').click()
    for (const [id, background] of Object.entries(BACKGROUND)) {
      const swatch = page.locator(`button [data-theme="${id}"]`)
      expect(await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(background)
    }
  })

  test('the saved theme is applied before the app loads, so a reload does not flash', async ({ page }) => {
    await page.goto('/')
    await themeButton(page, 'Rosé Pine').click()
    // Serve an empty app: only the script in index.html can set the theme now.
    // (The dev server loads the CSS through the app, so only the attribute is checked.)
    await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }))
    await page.reload()
    expect(await pageTheme(page)).toBe('rose-pine')
  })

  test('an unknown saved value falls back to Tokyo Night', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('open-f75:theme', 'gruvbox'))
    await page.goto('/')
    await expect(themeButton(page, 'Tokyo Night')).toHaveAttribute('aria-pressed', 'true')
    expect(await bodyBackground(page)).toBe(BACKGROUND['tokyo-night'])
  })

  test('still switches for the visit when storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
    })
    await page.goto('/')
    await themeButton(page, 'Rosé Pine').click()
    expect(await bodyBackground(page)).toBe(BACKGROUND['rose-pine'])
  })
})
