import { useCallback, useEffect, useState } from 'react'

// index.html reads the same key before the first paint, so a reload does not flash.
const KEY = 'open-f75:theme'

/** The colour schemes in src/index.css; the first is the default. */
export const THEMES = [
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha' },
  { id: 'rose-pine', name: 'Rosé Pine' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const isTheme = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value)

function load(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY)
    return isTheme(saved) ? saved : THEMES[0].id
  } catch {
    return THEMES[0].id // private mode or blocked storage
  }
}

/** The page theme, kept in this browser's localStorage. */
export function useTheme() {
  const [theme, setThemeState] = useState(load)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    // The browser's own chrome (tab strip on some platforms) follows the page background.
    const background = getComputedStyle(root).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage unavailable: the theme still applies for this visit
    }
  }, [])

  return { theme, setTheme, themes: THEMES }
}
