import { connectF75, expect, openWithBoard, pickColor, sendColor, test } from '@test/fixtures/app'

test.describe('packet log', () => {
  test('keeps working when scroll methods return a Promise, as in newer Chrome', async ({ page }) => {
    // Regression: an effect returned scrollIntoView's Promise and React crashed
    // with "destroy is not a function". The console-error fixture fails the test.
    await page.addInitScript(() => {
      const proto = Element.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
      for (const name of ['scrollIntoView', 'scrollTo', 'scrollBy']) {
        const original = proto[name]
        proto[name] = function (this: Element, ...args: unknown[]) {
          original.apply(this, args)
          return Promise.resolve()
        }
      }
    })
    await openWithBoard(page)
    await connectF75(page)
    await expect(page.getByRole('log')).toContainText('Identity 03 00 00 00 00 cd: AULA F75')
  })

  test('follows new entries only while scrolled to the bottom', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    const log = page.getByRole('log')
    const atBottom = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 24)

    await pickColor(page, '#00ff00')
    await sendColor(page)
    await expect(page.getByText(/^Dry run \(firmware colour/)).toBeVisible()
    expect(await atBottom()).toBe(true)

    await log.evaluate((el) => {
      el.scrollTop = 0
      el.dispatchEvent(new Event('scroll'))
    })
    await sendColor(page)
    await expect(log).toContainText('Dry run: 1 write(s) logged')
    expect(await log.evaluate((el) => el.scrollTop)).toBe(0)
  })

  test('clears', async ({ page }) => {
    await openWithBoard(page)
    await connectF75(page)
    await page.getByRole('button', { name: 'Clear log' }).click()
    await expect(page.getByRole('log')).toHaveText('Nothing yet. Connect the board to start.')
  })
})
