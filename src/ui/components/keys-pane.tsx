import { Brush, Eraser, PaintBucket, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { PER_KEY } from '@/protocol/effects'
import { F75_KEYS } from '@/protocol/keys'
import { SettingsOffset } from '@/protocol/settings'
import { KeyMap } from '@/ui/components/key-map'
import { Pane } from '@/ui/components/pane'
import { SendButton } from '@/ui/components/send-button'
import type { KeyColorsDraft } from '@/ui/hooks/use-key-colors'
import type { Session } from '@/ui/hooks/use-session'
import { resultMessage } from '@/ui/lib/result-message'
import { cn } from '@/ui/lib/utils'

type Tool = 'paint' | 'erase'

/** Phase 3: the per-key painter. Paints with the colour picked in the lighting pane. */
export function KeysPane({
  session,
  keys,
  paintColor,
  className,
}: {
  session: Session
  keys: KeyColorsDraft
  paintColor: string
  className?: string
}) {
  const [tool, setTool] = useState<Tool>('paint')
  const [status, setStatus] = useState<string | null>(null)
  const ready = session.connected && !session.busy && session.assessment?.canSend === true && session.board !== null
  const onBoard = session.board?.settings[SettingsOffset.effect] === PER_KEY
  const lit = F75_KEYS.filter((k) => keys.colors.has(k.led)).length

  async function onSend() {
    const outcome = await session.applyPerKey(keys.toRgb())
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    const { result, plan } = outcome.value
    const what = `the per-key effect with ${lit} key(s) lit`
    setStatus(resultMessage(result, { what, written: 'per-key colours + settings page', changes: plan.changes.length }))
  }

  const toolButton = (value: Tool, label: string, Icon: typeof Brush) => (
    <Button
      variant={tool === value ? 'secondary' : 'ghost'}
      size="xs"
      aria-pressed={tool === value}
      onClick={() => setTool(value)}
      className={cn('justify-start pointer-coarse:min-h-11', tool === value && 'ring-1 ring-primary')}
    >
      <Icon />
      {label}
    </Button>
  )

  return (
    <Pane
      title="keys"
      meta={`${lit} of ${F75_KEYS.length} lit${onBoard ? ' · per-key on the board' : ''}`}
      className={className}
      bodyClassName="flex flex-col gap-3 lg:flex-row lg:items-start"
    >
      <div className="flex shrink-0 flex-col gap-3 text-xs lg:w-48">
        <div className="flex flex-wrap gap-1 lg:flex-col">
          {toolButton('paint', 'Paint', Brush)}
          {toolButton('erase', 'Erase', Eraser)}
          <Button variant="ghost" size="xs" className="justify-start pointer-coarse:min-h-11" onClick={() => keys.fill(paintColor)}>
            <PaintBucket />
            Fill all
          </Button>
          <Button variant="ghost" size="xs" className="justify-start pointer-coarse:min-h-11" onClick={keys.clear}>
            <Trash2 />
            Clear all
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="justify-start pointer-coarse:min-h-11"
            disabled={!keys.revert}
            onClick={() => keys.revert?.()}
          >
            <RotateCcw />
            Board's colours
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          paint colour
          <span aria-hidden="true" className="size-3.5 rounded-sm border" style={{ backgroundColor: paintColor }} />
          {paintColor}
        </p>
        <div>
          <SendButton dryRun={session.dryRun} label="key colours" size="sm" disabled={!ready} onClick={() => void onSend()} />
        </div>
        {status && <p className="leading-relaxed">{status}</p>}
      </div>

      <KeyMap
        colors={keys.colors}
        onPaint={(k) => keys.paint(k.led, tool === 'paint' ? paintColor : null)}
        className="w-full min-w-0 lg:max-h-[30vh]"
      />
    </Pane>
  )
}
