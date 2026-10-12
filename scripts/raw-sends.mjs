// Enforces the roadmap rule that nothing but the allowlist guard talks to the
// board: raw WebHID access lives only in src/transports/webhid.ts, and only
// src/safe-send.ts calls Transport.send.
//
// Used in two places:
//   vite.config.ts   a module that breaks a rule fails to load (dev) or build
//   npm run lint     `node scripts/raw-sends.mjs` checks every file in src/
//
// This is a text check, so it can be dodged on purpose (an aliased variable).
// The transports also refuse anything off the allowlist at runtime.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {{ what: string, pattern: RegExp, allowed: string[] }[]} */
export const RULES = [
  {
    what: 'Raw WebHID access',
    pattern: /navigator\.hid|\.(sendReport|sendFeatureReport|receiveFeatureReport|requestDevice)\s*\(/,
    allowed: ['transports/webhid.ts'],
  },
  {
    what: 'Transport.send',
    pattern: /transport\.send\s*\(/,
    allowed: ['safe-send.ts'],
  },
]

/**
 * Rule violations in one source file.
 * @param {string} file path relative to src/, with forward slashes
 * @param {string} text the file's source
 * @returns {string[]}
 */
export function violations(file, text) {
  return RULES.filter((r) => r.pattern.test(text) && !r.allowed.includes(file)).map(
    (r) => `src/${file}: ${r.what} is only allowed in ${r.allowed.map((a) => `src/${a}`).join(', ')}. Go through the allowlist guard (src/safe-send.ts).`,
  )
}

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const src = fileURLToPath(new URL('../src', import.meta.url))
  const found = sourceFiles(src).flatMap((path) =>
    violations(relative(src, path).split(sep).join('/'), readFileSync(path, 'utf8')),
  )
  found.forEach((v) => console.error(v))
  process.exit(found.length ? 1 : 0)
}
