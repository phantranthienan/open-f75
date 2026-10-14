import { Copy, Trash2 } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { Button } from '@/ui/components/ui/button'
import type { LogEntry, LogKind } from '@/log'
import { Pane } from '@/ui/components/pane'
import { cn } from '@/ui/lib/utils'

const KIND: Record<LogKind, { label: string; className: string }> = {
  tx: { label: 'TX', className: 'text-signal-info' },
  rx: { label: 'RX', className: 'text-signal-ok' },
  dry: { label: 'DRY', className: 'text-signal-warn' },
  blocked: { label: 'BLOCK', className: 'text-signal-error' },
  error: { label: 'ERR', className: 'text-signal-error' },
  info: { label: 'INFO', className: 'text-muted-foreground' },
}

// One formatter for every line: building one per call is slow, and the log can hold 2000 lines.
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
})
const time = (at: number) => TIME.format(at)

function asText(entries: readonly LogEntry[]): string {
  return entries
    .map((e) => [time(e.at), KIND[e.kind].label.padEnd(5), e.text, e.hex ? `\n    ${e.hex}` : ''].join(' '))
    .join('\n')
}

const PREVIEW_BYTES = 24

/** Long frames (a 512-byte colour table) collapse to a preview; the full hex is a click away and in Copy log. */
function Hex({ hex }: { hex: string }) {
  const bytes = hex.split(' ')
  if (bytes.length <= PREVIEW_BYTES * 2) return <span className="col-start-3 break-words text-muted-foreground">{hex}</span>
  return (
    <details className="col-start-3 text-muted-foreground">
      <summary className="cursor-pointer break-words marker:text-primary">
        {bytes.slice(0, PREVIEW_BYTES).join(' ')} <span className="text-primary">… {bytes.length} bytes, show all</span>
      </summary>
      <span className="break-words">{hex}</span>
    </details>
  )
}

/**
 * Every frame as hex, logged before it is sent, like a terminal. Memoised: it
 * renders again only when the log changes, not on every wheel or paint move.
 */
export const LogPane = memo(function LogPane({
  entries,
  onClear,
  className,
}: {
  entries: readonly LogEntry[]
  onClear: () => void
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  // Follow new entries only while the log is scrolled to the bottom.
  const following = useRef(true)

  // Block body on purpose: an effect may only return a cleanup function, and
  // newer Chrome returns a Promise from scroll methods.
  useEffect(() => {
    const el = scroller.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <Pane
      title="packet log"
      meta={`${entries.length} lines`}
      className={className}
      bodyClassName="flex flex-col p-0 pt-3"
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy log"
            title="Copy log"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            onClick={() => void navigator.clipboard.writeText(asText(entries))}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear log"
            title="Clear log"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            onClick={onClear}
          >
            <Trash2 />
          </Button>
        </>
      }
    >
      <div
        ref={scroller}
        role="log"
        aria-label="Packet log entries"
        onScroll={(e) => {
          const el = e.currentTarget
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Connect the board to start.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[auto_3rem_minmax(0,1fr)] gap-x-2 py-0.5">
              <span className="text-muted-foreground">{time(e.at)}</span>
              <span className={cn('font-semibold', KIND[e.kind].className)}>{KIND[e.kind].label}</span>
              <span className={cn('break-words', (e.kind === 'error' || e.kind === 'blocked') && 'text-signal-error')}>
                {e.text}
              </span>
              {e.hex && <Hex hex={e.hex} />}
            </div>
          ))
        )}
      </div>
    </Pane>
  )
})
