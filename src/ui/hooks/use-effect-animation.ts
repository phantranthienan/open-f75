import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { F75_KEYS } from '@/protocol/keys'
import { colorSetting, type LightingChoice } from '@/protocol/lighting'
import { createAnimation, reactsToKeys } from '@/ui/lib/animations'
import { seededRandom } from '@/ui/lib/animations/random'
import type { EffectAnimation, Rgb } from '@/ui/lib/animations/types'
import { ledForCode } from '@/ui/lib/key-codes'

/** Keys don't need more than ~30 redraws a second. */
const FRAME_MS = 33
/** After a long pause (a background tab), catch up at most this many ticks instead of replaying them all. */
const MAX_CATCH_UP = 20

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches

/** Typing in a field (the hex colour, a profile name) is not a key press for the preview. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(target.type)
}

/**
 * Plays the chosen effect's animation (lib/animations) for the key map: steps
 * it on its own timer, redraws when it changed, and feeds it the keys pressed
 * on the computer's keyboard while the page has focus. `frame` is null when
 * there is nothing to play, or the system asks for reduced motion; the map
 * then shows the still preview. Brightness is left to the caller, so moving
 * the slider doesn't restart the animation.
 */
export function useEffectAnimation(choice: LightingChoice) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)
  const animation = useRef<EffectAnimation | null>(null)
  const dirty = useRef(false)

  // Only what the animation depends on restarts it; the colour as hex, since an Rgb is a new array every render.
  const setting = colorSetting(choice)
  const hex = typeof setting === 'object' && setting !== null ? formatHexColor(setting) : null
  const { effect } = choice
  const speed = choice.speed ?? 2
  const playing = !reducedMotion
  const id = `${effect.value} ${hex} ${speed}`

  // Each frame is tagged with its animation, so a frame left from the previous one is never shown.
  const [drawn, setDrawn] = useState<{ id: string; colors: ReadonlyMap<number, Rgb> } | null>(null)
  const frame = playing && drawn?.id === id ? drawn.colors : null

  useEffect(() => {
    if (!playing) return
    const options = { keys: F75_KEYS, color: hex ? parseHexColor(hex) : null, speed, random: seededRandom(effect.value) }
    const created = createAnimation(effect, options)
    animation.current = created
    if (!created) return

    let last = performance.now()
    let lastDraw = -Infinity // the first tick draws at once
    let pending = 0
    let request = 0
    const tick = (now: number) => {
      pending += now - last
      last = now
      let steps = 0
      while (pending >= created.interval && steps < MAX_CATCH_UP) {
        created.step()
        pending -= created.interval
        steps++
      }
      if (steps === MAX_CATCH_UP) pending = 0
      if (steps > 0) dirty.current = true
      if ((dirty.current || lastDraw === -Infinity) && now - lastDraw >= FRAME_MS) {
        dirty.current = false
        lastDraw = now
        setDrawn({ id, colors: new Map(created.colors()) })
      }
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(request)
      animation.current = null
    }
  }, [effect, hex, speed, id, playing])

  /** A key pressed or clicked: the effects that react to typing light up from it. */
  const press = useCallback((led: number) => {
    if (!animation.current?.press) return
    animation.current.press(led)
    dirty.current = true
  }, [])

  const animating = frame !== null
  useEffect(() => {
    if (!animating) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTyping(e.target)) return
      const led = ledForCode(e.code)
      if (led !== undefined) press(led)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [animating, press])

  return { frame, press, reacts: animating && reactsToKeys(effect) }
}
