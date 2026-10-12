/**
 * Enforces the roadmap rule "no other code may call sendFeatureReport or
 * sendReport": raw HID writes live in transports/, and only safe-send.ts may
 * call Transport.send.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles(SRC)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file))
    .sort()
}

describe('allowlist guard', () => {
  it('only transports call the WebHID write APIs', () => {
    expect(filesMatching(/\.(sendReport|sendFeatureReport)\s*\(/)).toEqual(['transports/webhid.ts'])
  })

  it('only safe-send.ts calls Transport.send', () => {
    expect(filesMatching(/transport\.send\s*\(/)).toEqual(['safe-send.ts'])
  })
})
