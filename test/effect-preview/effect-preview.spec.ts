import type { Page } from '@playwright/test'
import { connectF75, expect, openWithBoard, pickColor, selectEffect, test } from '@test/fixtures/app'

/** Every key's colour on the Effect-mode preview, by key name ('var(--muted)' for a dark key). */
function previewColors(page: Page): Promise<Record<string, string>> {
  return page
    .getByRole('img', { name: /^Preview/ })
    .locator('[data-key]')
    .evaluateAll((keys) => Object.fromEntries(keys.map((k) => [k.getAttribute('data-key'), k.querySelector('rect')!.getAttribute('fill')!])))
}

const lit = (colors: Record<string, string>) => Object.keys(colors).filter((name) => colors[name].startsWith('#'))

/** The lit keys, polled: after the clock moves, React may still be drawing the newest frame. */
const expectLit = (page: Page) => expect.poll(async () => lit(await previewColors(page)), { timeout: 2000 })

const T0 = new Date('2026-10-15T12:00:00Z')

/**
 * Connected, on an effect, with the page's clock stopped: animations step only
 * when the test moves time with clock.runFor. (Connecting needs time to flow.)
 */
async function openOn(page: Page, effect: string, color?: string) {
  await page.clock.install({ time: T0 })
  await openWithBoard(page)
  await connectF75(page)
  await page.clock.pauseAt(new Date(T0.getTime() + 60_000))
  await selectEffect(page, effect)
  const colorful = page.getByRole('switch', { name: 'Colourful' })
  if (color && (await colorful.count()) && (await colorful.isChecked())) await colorful.click()
  if (color) await pickColor(page, color)
  await page.locator('h1').click() // key presses go to the page, not the effect list
  await page.clock.runFor(50) // the first animation frame
}

test.describe('effect preview', () => {
  test('Breathing fades every key together and brings it back', async ({ page }) => {
    await openOn(page, 'Breathing', '#00ff00')
    await expect(page.getByText("preview of Breathing in #00ff00, as AULA's app animates it")).toBeVisible()

    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) {
      await page.clock.runFor(250)
      const colors = Object.values(await previewColors(page))
      expect(new Set(colors).size, 'all keys breathe together').toBe(1)
      expect(colors[0]).toMatch(/^#00[0-9a-f]{2}00$/) // only green, dimmed
      seen.add(colors[0])
    }
    expect(seen.size, 'the level changes').toBeGreaterThan(3)
  })

  test('Rainbow wheel turns', async ({ page }) => {
    await openOn(page, 'Rainbow wheel')
    await page.clock.runFor(200)
    const before = await previewColors(page)
    await page.clock.runFor(450)
    const after = await previewColors(page)
    expect(lit(after)).toHaveLength(80)
    expect(Object.keys(after).filter((k) => after[k] !== before[k]).length).toBeGreaterThan(40)
  })

  test('Reaction lights the key pressed on the computer, then lets it fade', async ({ page }) => {
    await openOn(page, 'Reaction', '#ff0000')
    await expect(page.getByText(/· type or click keys$/)).toBeVisible()
    // A real press holds the idle demo back for 2 s; wait for its keys to fade.
    await page.keyboard.press('KeyW')
    await page.clock.runFor(500)
    await expectLit(page).toEqual([])

    await page.keyboard.press('KeyQ')
    await page.clock.runFor(60) // a few ticks: the board stores Reaction at speed 4 (25 ms), so it is already fading
    await expectLit(page).toEqual(['Q'])
    expect((await previewColors(page)).Q).toMatch(/^#[0-9a-f]{2}0000$/) // red, dimmed by the fade
    await page.clock.runFor(500)
    await expectLit(page).toEqual([])
  })

  test('a click on the preview counts as a press; typing in a field does not', async ({ page }) => {
    await openOn(page, 'Reaction', '#ff0000')
    await page.keyboard.press('KeyW')
    await page.clock.runFor(500)

    await page.getByLabel('Profile name').pressSequentially('q')
    await page.clock.runFor(60)
    await expectLit(page).toEqual([])

    await page.getByRole('img', { name: /^Preview/ }).locator('[data-key="Esc"]').click()
    await page.clock.runFor(60)
    await expectLit(page).toEqual(['Esc'])
  })

  test('the reactive effects show what they do while nobody types', async ({ page }) => {
    await openOn(page, 'Ripples shining')
    let most = 0
    for (let i = 0; i < 10; i++) {
      await page.clock.runFor(150)
      most = Math.max(most, lit(await previewColors(page)).length)
    }
    expect(most).toBeGreaterThan(0)
  })

  test('every effect AULA offers on the F75 plays', async ({ page }) => {
    await openOn(page, 'Fixed on')
    const names = await page.getByLabel('Effect').locator('option').allTextContents()
    expect(names).toHaveLength(16) // 15 effects and off
    for (const name of names.filter((n) => n !== 'Off')) {
      await selectEffect(page, name)
      let shown = 0
      for (let i = 0; i < 8 && shown === 0; i++) {
        await page.clock.runFor(300)
        shown = lit(await previewColors(page)).length
      }
      expect(shown, name).toBeGreaterThan(0)
    }
    await selectEffect(page, 'Off')
    await page.clock.runFor(300)
    await expectLit(page).toEqual([])
  })

  test('reduced motion keeps the still preview', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openOn(page, 'Breathing', '#00ff00')
    await expect(page.getByText('preview of Breathing in #00ff00, which moves on the board')).toBeVisible()
    const before = await previewColors(page)
    await page.clock.runFor(1000)
    expect(await previewColors(page)).toEqual(before)
  })
})
