/**
 * Lighting profiles: what the lighting and keys panes hold, saved under a name
 * in this browser and exported or imported as JSON. Framework-free.
 *
 * A profile only fills the controls; nothing is sent until the user presses
 * Send. Everything read from storage or a file is checked here, so a damaged
 * or hand-edited entry can never reach the controls.
 */
import { MAX_BRIGHTNESS, MAX_SPEED, findEffect } from '@/protocol/effects'
import { LED_SLOTS } from '@/protocol/per-key'

export interface Profile {
  name: string
  /** The effect's 0x0a value. */
  effect: number
  brightness: number
  speed: number
  colorful: boolean
  /** #rrggbb, the colour the effect uses and the keys are painted with. */
  color: string
  /** LED index -> #rrggbb; keys left out are off. */
  keys: Record<string, string>
}

export interface ProfilesFile {
  format: 'open-f75-profiles'
  version: 1
  profiles: Profile[]
}

export const MAX_NAME_LENGTH = 40

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v)
const isUpTo = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max

/** A valid profile, or null. Keys with a bad index or colour are dropped. */
export function parseProfile(value: unknown): Profile | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, MAX_NAME_LENGTH) : ''
  if (!name || !isUpTo(p.effect, 0xff) || !findEffect(p.effect)) return null
  if (!isUpTo(p.brightness, MAX_BRIGHTNESS) || !isUpTo(p.speed, MAX_SPEED)) return null
  if (typeof p.colorful !== 'boolean' || !isHex(p.color)) return null
  const keys = typeof p.keys === 'object' && p.keys !== null ? (p.keys as Record<string, unknown>) : {}
  return {
    name,
    effect: p.effect,
    brightness: p.brightness,
    speed: p.speed,
    colorful: p.colorful,
    color: p.color,
    keys: Object.fromEntries(
      Object.entries(keys).filter((entry): entry is [string, string] => isUpTo(Number(entry[0]), LED_SLOTS - 1) && isHex(entry[1])),
    ),
  }
}

export function toProfilesFile(profiles: readonly Profile[]): string {
  const file: ProfilesFile = { format: 'open-f75-profiles', version: 1, profiles: [...profiles] }
  return JSON.stringify(file, null, 2)
}

/** The profiles in an exported file. Throws when the file is not one. */
export function parseProfilesFile(text: string): Profile[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not JSON.')
  }
  const file = data as Partial<ProfilesFile> | null
  if (file?.format !== 'open-f75-profiles' || !Array.isArray(file.profiles)) {
    throw new Error('This is not an open-f75 profiles file.')
  }
  const profiles = file.profiles.map(parseProfile).filter((p): p is Profile => p !== null)
  if (profiles.length === 0) throw new Error('The file has no valid profiles.')
  return profiles
}

/** `incoming` replaces profiles of the same name; the newest come first. */
export function mergeProfiles(current: readonly Profile[], incoming: readonly Profile[]): Profile[] {
  const names = new Set(incoming.map((p) => p.name))
  return [...incoming, ...current.filter((p) => !names.has(p.name))]
}
