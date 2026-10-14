import { RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import type { BoardState } from '@/keyboard'
import { errorMessage } from '@/log'
import { MAX_BRIGHTNESS, MAX_SPEED, OFF, PER_KEY, type Effect } from '@/protocol/effects'
import {
  describeChoice,
  describeWrites,
  liveEffect,
  planLighting,
  readEffectState,
  type LightingChoice,
  type LightingPlan,
} from '@/protocol/lighting'
import { ColorPicker } from '@/ui/components/color-picker'
import { Pane } from '@/ui/components/pane'
import { SendButton } from '@/ui/components/send-button'
import { LIGHTING_EFFECTS, type Lighting } from '@/ui/hooks/use-lighting'
import type { Session } from '@/ui/hooks/use-session'
import { resultMessage } from '@/ui/lib/result-message'
import { cn } from '@/ui/lib/utils'

/** A labelled 0..max slider with its value; disabled with a reason when the effect has no such control. */
function Range(props: { label: string; value: number; max: number; onChange: (n: number) => void; disabledReason: string | null }) {
  const id = useId()
  const disabled = props.disabledReason !== null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <Label htmlFor={id} className={cn('text-xs', disabled && 'text-muted-foreground')}>
          {props.label}
        </Label>
        <output htmlFor={id} className="text-muted-foreground">
          {disabled ? props.disabledReason : `${props.value} / ${props.max}`}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={props.max}
        step={1}
        value={props.value}
        disabled={disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-5 w-full accent-primary disabled:opacity-40 pointer-coarse:h-11"
      />
    </div>
  )
}

/** "board: Fixed on · 7/9", for the pane's border. */
function boardSummary(board: BoardState | null): string {
  if (!board) return 'board not read'
  const live = liveEffect(board.settings)
  if (!live) return "board: an effect AULA's profile doesn't list"
  const state = readEffectState(board.settings, board.colorTable, live)
  return live.brightness && state ? `board: ${live.name} · ${state.brightness}/${MAX_BRIGHTNESS}` : `board: ${live.name}`
}

/** What Send will do, worked out with the same plan Send uses on the board as last read. */
function hint(board: BoardState, choice: LightingChoice): string {
  let plan: LightingPlan
  try {
    plan = planLighting(board.settings, board.colorTable, choice)
  } catch (err) {
    return errorMessage(err)
  }
  if (plan.changes.length === 0) return 'the board already shows this · Send writes nothing'
  // The key colours stay stored; the keys pane's Send makes them live again.
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
    case 'own':
      return `${effect.name} uses its own colours here (AULA's driver sets none for it)`
    default:
      if (effect.value === OFF) return 'off · writes the effect byte only'
      return `${effect.name} has no colour setting`
  }
}

/** Phase 3: every whole-board effect, with its brightness, speed and colour, starting from what the board shows. */
export function LightingPane({ session, lighting, className }: { session: Session; lighting: Lighting; className?: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const { board } = session
  const { effect } = lighting

  async function onSend() {
    const outcome = await session.applyLighting(lighting.choice)
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    const { result, plan } = outcome.value
    setStatus(resultMessage(result, plan, describeChoice(lighting.choice)))
  }

  return (
    <Pane
      title="lighting"
      meta={boardSummary(board)}
      className={className}
      bodyClassName="flex flex-col gap-4"
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">
            {board ? hint(board, lighting.choice) : 'Connect the board: its lighting is read first, then you can change it.'}
          </p>
          <div className="flex items-center gap-3">
            <SendButton dryRun={session.dryRun} disabled={!session.canSend || !board} onClick={() => void onSend()} />
            {status && <p role="status" className="leading-snug">{status}</p>}
          </div>
        </div>
      }
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
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="effect" className="text-xs">
            Effect
          </Label>
          {effect.colorful && (
            <span className="flex items-center gap-2">
              <Label htmlFor="colorful" className="text-xs">
                Colourful
              </Label>
              <Switch id="colorful" checked={lighting.colorful} onCheckedChange={lighting.setColorful} />
            </span>
          )}
        </div>
        <select
          id="effect"
          value={effect.value}
          onChange={(e) => lighting.selectEffect(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {LIGHTING_EFFECTS.map((e) => (
            <option key={e.value} value={e.value} className="bg-popover">
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-x-4">
        <Range
          label="Brightness"
          value={lighting.brightness}
          max={MAX_BRIGHTNESS}
          onChange={lighting.setBrightness}
          disabledReason={effect.brightness ? null : 'none here'}
        />
        <Range
          label="Speed"
          value={lighting.speed}
          max={MAX_SPEED}
          onChange={lighting.setSpeed}
          disabledReason={effect.speed ? null : 'none here'}
        />
      </div>

      <ColorPicker value={lighting.color} onChange={lighting.setColor} />
    </Pane>
  )
}
