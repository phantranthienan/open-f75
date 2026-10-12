import { modelName } from '@/protocol/ids'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'

/** Bottom status line, vim/tmux style: mode, board, activity and frame counts. */
export function StatusLine({ session }: { session: Session }) {
  const { dryRun, busy, connected, identity, entries } = session
  const count = (kind: string) => entries.filter((e) => e.kind === kind).length
  const board = !connected
    ? 'no board'
    : identity?.status === 'read'
      ? modelName(identity.bytes)
      : identity?.status === 'failed'
        ? 'identity failed'
        : 'identifying…'

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-card px-3 py-1 text-xs">
      <span className={cn('px-1.5 font-bold text-background', dryRun ? 'bg-signal-warn' : 'bg-signal-error')}>
        {dryRun ? 'DRY RUN' : 'LIVE'}
      </span>
      <span className="text-muted-foreground">
        {dryRun ? 'writes are logged, not sent' : 'writes go to the board · stay wired, do not unplug mid-write'}
      </span>
      <span>board: {board}</span>
      <span className="ml-auto flex gap-3 text-muted-foreground">
        <span className={busy ? 'text-signal-warn' : undefined}>{busy ? 'working…' : 'idle'}</span>
        <span>tx {count('tx')}</span>
        <span>rx {count('rx')}</span>
        <span>dry {count('dry')}</span>
        <span>blocked {count('blocked')}</span>
      </span>
    </footer>
  )
}
