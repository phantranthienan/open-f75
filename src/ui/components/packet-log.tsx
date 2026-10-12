import { Copy, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/ui/card'
import type { LogEntry, LogKind } from '@/log'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'

const KIND: Record<LogKind, { label: string; className: string }> = {
  tx: { label: 'TX', className: 'text-sky-600 dark:text-sky-400' },
  rx: { label: 'RX', className: 'text-emerald-600 dark:text-emerald-400' },
  dry: { label: 'DRY', className: 'text-amber-600 dark:text-amber-400' },
  blocked: { label: 'BLOCK', className: 'text-destructive' },
  error: { label: 'ERR', className: 'text-destructive' },
  info: { label: 'INFO', className: 'text-muted-foreground' },
}

const time = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  })

function asText(entries: readonly LogEntry[]): string {
  return entries
    .map((e) => [time(e.at), KIND[e.kind].label.padEnd(5), e.text, e.hex ? `\n    ${e.hex}` : ''].join(' '))
    .join('\n')
}

export function PacketLog({ session }: { session: Session }) {
  const { entries } = session
  const scroller = useRef<HTMLDivElement>(null)
  // Follow new entries only while the log is scrolled to the bottom.
  const following = useRef(true)
  const counts = entries.reduce<Partial<Record<LogKind, number>>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {})

  // Block body on purpose: an effect may only return a cleanup function, and
  // newer Chrome returns a Promise from scroll methods.
  useEffect(() => {
    const el = scroller.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <Card className="flex min-h-0 flex-col lg:h-[calc(100dvh-7rem)]">
      <CardHeader>
        <CardTitle>Packet log</CardTitle>
        <CardDescription>
          Every frame as hex, logged before it is sent. {counts.tx ?? 0} sent · {counts.rx ?? 0} received ·{' '}
          {counts.dry ?? 0} dry run · {counts.blocked ?? 0} blocked
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Copy log"
            title="Copy log"
            onClick={() => void navigator.clipboard.writeText(asText(entries))}
          >
            <Copy />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Clear log" title="Clear log" onClick={session.clearLog}>
            <Trash2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="h-80 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed lg:h-full"
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground">Nothing yet. Connect a board or switch on the mock.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="grid grid-cols-[auto_3rem_minmax(0,1fr)] gap-x-2 py-0.5">
                <span className="text-muted-foreground">{time(e.at)}</span>
                <span className={cn('font-semibold', KIND[e.kind].className)}>{KIND[e.kind].label}</span>
                <span className={cn('break-words', e.kind === 'error' && 'text-destructive')}>{e.text}</span>
                {e.hex && <span className="col-start-3 break-words text-muted-foreground">{e.hex}</span>}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
