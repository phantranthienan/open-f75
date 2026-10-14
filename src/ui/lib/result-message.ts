import type { ApplyResult } from '@/keyboard'
import { describeWrites, type LightingPlan } from '@/protocol/lighting'

/** The status line after a write of `what`: nothing to do, a dry run, or saved and read back. */
export function resultMessage(result: ApplyResult, plan: LightingPlan, what: string): string {
  const written = describeWrites(plan)
  if (result === 'unchanged') return `The board already shows ${what}. Nothing was written.`
  if (result === 'dry-run') {
    return `Dry run (${written}): ${plan.changes.length} byte(s) would change, listed in the log. Turn dry run off to send.`
  }
  return `Saved ${what} (${written}) and read it back. Unplug and replug to check that it sticks.`
}
