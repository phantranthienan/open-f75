import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { violations } from '#scripts/raw-sends.mjs'

const SRC = path.resolve(import.meta.dirname, './src')

/**
 * Nothing may bypass the allowlist guard. A module that touches WebHID outside
 * src/transports/webhid.ts, or calls transport.send outside src/safe-send.ts,
 * fails to load in dev and fails the build (rules in scripts/raw-sends.mjs).
 */
function enforceAllowlistGuard(): Plugin {
  return {
    name: 'open-f75:enforce-allowlist-guard',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.startsWith(SRC + path.sep) || !/\.tsx?$/.test(file)) return
      const found = violations(path.relative(SRC, file).split(path.sep).join('/'), code)
      if (found.length) this.error(found.join('\n'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [enforceAllowlistGuard(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': SRC,
    },
  },
})
