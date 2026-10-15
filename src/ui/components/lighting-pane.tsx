import { RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import type { BoardState } from '@/keyboard'
import { errorMessage } from '@/log'
import { MAX_BRIGHTNESS, OFF, PER_KEY, type Effect } from '@/protocol/effects'
import { F75_KEYS, type Key } from '@/protocol/keys'
import {
  describeChoice,
  describeWrites,
  liveEffect,
  planLighting,
  planPerKey,
  readEffectState,
  type LightingChoice,
  type LightingPlan,
} from '@/protocol/lighting'
import type { KeyColors } from '@/protocol/per-key'
import { SettingsOffset } from '@/protocol/settings'
import { ColorPicker } from '@/ui/components/color-picker'
import { EffectControls } from '@/ui/components/effect-controls'
import { KeyMap } from '@/ui/components/key-map'
import { KeyTools, type Tool } from '@/ui/components/key-tools'
import { Pane } from '@/ui/components/pane'
import { SendButton } from '@/ui/components/send-button'
import type { KeyColorsDraft } from '@/ui/hooks/use-key-colors'
import type { Lighting, LightingMode } from '@/ui/hooks/use-lighting'
import type { Session } from '@/ui/hooks/use-session'
import { previewColors } from '@/ui/lib/preview'
import { resultMessage } from '@/ui/lib/result-message'
import { cn } from '@/ui/lib/utils'

/** "board: Fixed on · 7/9", for the pane's border. An unlisted effect shows its 0x0a value. */
function boardSummary(board: BoardState | null): string {
  if (!board) return 'board not read'
  const live = liveEffect(board.settings)
  if (!live) return `board: effect ${board.settings[SettingsOffset.effect]}, not in AULA's list`
  if (!live.supported) return `board: ${live.name}, hidden by AULA`
  const state = readEffectState(board.settings, board.colorTable, live)
  return live.brightness && state ? `board: ${live.name} · ${state.brightness}/${MAX_BRIGHTNESS}` : `board: ${live.name}`
}

/** What Send will do in Effect mode, worked out with the same plan Send uses on the board as last read. */
function effectHint(board: BoardState, choice: LightingChoice): string {
  let plan: LightingPlan
  try {
    plan = planLighting(board.settings, board.colorTable, choice)
  } catch (err) {
    return errorMessage(err)
  }
  if (plan.changes.length === 0) return 'the board already shows this · Send writes nothing'
  // The key colours stay stored; Send in Per-key mode makes them live again.
  if (liveEffect(board.settings)?.value === PER_KEY) {
    return `Send switches the board from your key colours to ${choice.effect.name} · ${describeWrites(plan)}`
  }
  return planHint(plan, choice.effect)
}

function planHint(plan: LightingPlan, effect: Effect): string {
  switch (plan.colorPath) {
    case 'firmware':
      return `colour already in the effect's row (slot ${plan.colorIndex}) · ${describeWrites(plan)}, the path confirmed on an F75`
    case 'custom':
      return `custom colour into slot 0 of the effect's colour-table row · ${describeWrites(plan)}`
    case 'colorful':
      return `colourful · the effect picks its colours itself · ${describeWrites(plan)}`
    default:
      if (effect.value === OFF) return 'off · writes the effect byte only'
      return `${effect.name} has no colour setting`
  }
}

/** What Send will do in Per-key mode. */
function perKeyHint(board: BoardState, colors: KeyColors): string {
  let plan: LightingPlan
  try {
    plan = planPerKey(board.settings, board.perKey, colors)
  } catch (err) {
    return errorMessage(err)
  }
  if (plan.changes.length === 0) return 'the board already shows these key colours · Send writes nothing'
  const live = liveEffect(board.settings)
  if (live?.value !== PER_KEY) return `Send switches the board from ${live?.name ?? 'its effect'} to your key colours · ${describeWrites(plan)}`
  return `${plan.changes.length} byte(s) change · ${describeWrites(plan)}`
}

/** Effect or Per-key: which of the two Send makes live. Switching sends nothing. */
function ModeSwitch({ mode, onChange }: { mode: LightingMode; onChange: (mode: LightingMode) => void }) {
  const option = (value: LightingMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={cn(
        'rounded-sm px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11',
        mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
  return (
    <div role="group" aria-label="Mode" className="inline-flex self-start rounded-md border p-0.5">
      {option('effect', 'Effect')}
      {option('perKey', 'Per-key')}
    </div>
  )
}

/**
 * Phase 3: the board's lighting, one effect at a time, as the board shows it.
 * Effect mode sets a whole-board effect with its brightness, speed and colour,
 * and previews it on the key map; Per-key mode paints each key on the map.
 * Both start from what the board shows, share the colour picker and one Send.
 */
export function LightingPane({
  session,
  lighting,
  keys,
  className,
}: {
  session: Session
  lighting: Lighting
  keys: KeyColorsDraft
  className?: string
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('paint')
  const { board } = session
  const { mode, choice } = lighting
  const perKey = mode === 'perKey'

  // Stable while painting, so only the painted key re-renders (KeyMap memoises its keys).
  const { paint } = keys
  const paintColor = lighting.color
  const onPaint = useCallback((k: Key) => paint(k.led, tool === 'paint' ? paintColor : null), [paint, tool, paintColor])

  function changeMode(next: LightingMode) {
    lighting.setMode(next)
    setStatus(null)
  }

  async function onSend() {
    const lit = F75_KEYS.filter((k) => keys.colors.has(k.led)).length
    const outcome = perKey ? await session.applyPerKey(keys.toRgb()) : await session.applyLighting(choice)
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    const { result, plan } = outcome.value
    setStatus(resultMessage(result, plan, perKey ? `the per-key effect with ${lit} key(s) lit` : describeChoice(choice)))
  }

  let hint = 'Connect the board: its lighting is read first, then you can change it.'
  if (board) hint = perKey ? perKeyHint(board, keys.toRgb()) : effectHint(board, choice)

  return (
    <Pane
      title="lighting"
      meta={boardSummary(board)}
      className={className}
      bodyClassName="@container flex flex-col gap-4"
      actions={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Read board"
          title="Read the board's lighting again"
          disabled={!session.canSend}
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          onClick={() => void session.readBoard()}
        >
          <RefreshCw />
        </Button>
      }
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">{hint}</p>
          <div className="flex items-center gap-3">
            <SendButton
              dryRun={session.dryRun}
              label={perKey ? 'key colours' : ''}
              disabled={!session.canSend || !board}
              onClick={() => void onSend()}
            />
            {status && (
              <p role="status" className="leading-snug">
                {status}
              </p>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-4 @lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ModeSwitch mode={mode} onChange={changeMode} />
          {perKey ? (
            <KeyTools tool={tool} onTool={setTool} keys={keys} paintColor={paintColor} />
          ) : (
            <EffectControls lighting={lighting} />
          )}
        </div>
        <ColorPicker value={lighting.color} onChange={lighting.setColor} />
      </div>

      {perKey ? (
        <KeyMap colors={keys.colors} onPaint={onPaint} className="w-full min-w-0" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <KeyMap colors={previewColors(choice)} label={`Preview: ${describeChoice(choice)}`} className="w-full min-w-0" />
          <p className="text-xs text-muted-foreground">
            preview of {describeChoice(choice)}
            {choice.effect.speed && ', which moves on the board'}
          </p>
        </div>
      )}
    </Pane>
  )
}
