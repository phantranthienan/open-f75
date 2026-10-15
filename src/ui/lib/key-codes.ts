import { F75_KEYS } from '@/protocol/keys'

/**
 * KeyboardEvent.code (the physical key, whatever the OS layout) for each F75
 * key, by its name in keys.ts. The browser never sees Fn, and the knob has no
 * code, so neither is here.
 */
const CODE_BY_NAME: Record<string, string> = {
  Esc: 'Escape',
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  PgUp: 'PageUp',
  CapsLock: 'CapsLock',
  ';': 'Semicolon',
  "'": 'Quote',
  Enter: 'Enter',
  PgDn: 'PageDown',
  LShift: 'ShiftLeft',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  RShift: 'ShiftRight',
  Up: 'ArrowUp',
  End: 'End',
  LCtrl: 'ControlLeft',
  LWin: 'MetaLeft', // ⌘ on a Mac
  LAlt: 'AltLeft', // ⌥ on a Mac
  Space: 'Space',
  RCtrl: 'ControlRight',
  Left: 'ArrowLeft',
  Down: 'ArrowDown',
  Right: 'ArrowRight',
}

/** F1..F12, letters and digits follow a pattern; the rest are listed. */
function codeOf(name: string): string | undefined {
  if (/^F\d+$/.test(name)) return name
  if (/^[A-Z]$/.test(name)) return `Key${name}`
  if (/^\d$/.test(name)) return `Digit${name}`
  return CODE_BY_NAME[name]
}

const LED_BY_CODE = new Map(F75_KEYS.flatMap((k) => (codeOf(k.name) ? [[codeOf(k.name)!, k.led] as const] : [])))

/** The LED under the key a KeyboardEvent came from, or undefined for keys the F75 doesn't have. */
export function ledForCode(code: string): number | undefined {
  return LED_BY_CODE.get(code)
}
