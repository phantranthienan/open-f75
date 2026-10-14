import type { ApplyResult } from '@/keyboard'

/** The status line after a write: nothing to do, a dry run, or saved and read back. */
export function resultMessage(
  result: ApplyResult,
  { what, written, changes }: { what: string; written: string; changes: number },
): string {
  if (result === 'unchanged') return `The board already shows ${what}. Nothing was written.`
  if (result === 'dry-run') {
    return `Dry run (${written}): ${changes} byte(s) would change, listed in the log. Turn dry run off to send.`
  }
  return `Saved ${what} (${written}) and read it back. Unplug and replug to check that it sticks.`
}
