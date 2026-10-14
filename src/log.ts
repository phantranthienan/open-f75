/** Packet log: every frame in or out, plus status lines. Framework-free so tests can read it. */

export type LogKind = 'tx' | 'rx' | 'dry' | 'blocked' | 'info' | 'error'

export interface LogEntry {
  id: number
  at: number
  kind: LogKind
  text: string
  hex?: string
}

export interface Log {
  add(kind: LogKind, text: string, hex?: string): void
  clear(): void
  entries(): readonly LogEntry[]
  subscribe(listener: () => void): () => void
}

export function createLog(limit = 2000): Log {
  let entries: LogEntry[] = []
  let nextId = 1
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  return {
    add(kind, text, hex) {
      entries = [...entries.slice(-(limit - 1)), { id: nextId++, at: Date.now(), kind, text, hex }]
      notify()
    },
    clear() {
      entries = []
      notify()
    },
    entries: () => entries,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** An error's message for a log line or a status message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
