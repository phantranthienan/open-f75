import { RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import type { BoardState } from '@/keyboard'
import { formatHexColor } from '@/protocol/bytes'
import { COLOR_NAMES, FIRMWARE_COLORS } from '@/protocol/color-table'
import { EFFECTS, MAX_BRIGHTNESS, MAX_SPEED, OFF, PER_KEY, findEffect } from '@/protocol/effects'
import { readEffectState, type LightingChoice, type LightingPlan } from '@/protocol/lighting'
import { SettingsOffset } from '@/protocol/settings'
import { ColorPicker } from '@/ui/components/color-picker'
import { Pane } from '@/ui/components/pane'
import { SendButton } from '@/ui/components/send-button'
import type { Lighting } from '@/ui/hooks/use-lighting'
import type { Session } from '@/ui/hooks/use-session'
import { resultMessage } from '@/ui/lib/result-message'
import { cn } from '@/ui/lib/utils'

const FIRMWARE_HEX = FIRMWARE_COLORS.map(formatHexColor)

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

/** "Fixed on in #00ff00", "Breathing, colourful", "Rainbow". */
function describe({ effect, color }: LightingChoice): string {
  if (color === 'colorful') return `${effect.name}, colourful`
  if (effect.color && color !== 'own') return `${effect.name} in ${formatHexColor(color)}`
  return effect.name
}

function whatIsWritten(plan: LightingPlan): string {
  if (plan.colorPath === 'custom') return 'custom colour, colour table + settings page'
  if (plan.colorPath === 'firmware') return 'firmware colour, settings page only'
  return 'settings page only'
}

/** "board: Fixed on · 7/9", for the pane's border. */
function boardSummary(board: BoardState | null): string {
  if (!board) return 'board not read'
  const value = board.settings[SettingsOffset.effect]
  const live = findEffect(value)
  if (!live) return `board: effect ${value}`
  const state = readEffectState(board.settings, board.colorTable, live)
  return live.brightness && state ? `board: ${live.name} · ${state.brightness}/${MAX_BRIGHTNESS}` : `board: ${live.name}`
}

/** What Send will do with the current choice, before anything is read. */
function hint(lighting: Lighting): string {
  const { effect, colorful, color } = lighting
  if (effect.value === OFF) return 'off · writes the effect byte only'
  if (effect.value === PER_KEY) return 'per-key · shows the colours stored on the board'
  if (colorful) return 'colourful · the effect picks its colours itself; settings page only'
  if (effect.colorful && !effect.color) return `${effect.name} uses its own colours here (AULA's driver sets none for it)`
  if (!effect.color) return `${effect.name} has no colour setting`
  const firmware = FIRMWARE_HEX.indexOf(color)
  return firmware >= 0
    ? `firmware colour ${firmware} (${COLOR_NAMES[firmware]}) · normally one settings byte, confirmed on an F75`
    : "custom colour · also writes the effect's colour-table row, only if your board's table has the expected layout"
}

/** Phase 3: every effect, with its brightness, speed and colour, starting from what the board shows. */
export function LightingPane({ session, lighting, className }: { session: Session; lighting: Lighting; className?: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const { board } = session
  const { effect } = lighting
  const ready = session.connected && !session.busy && session.assessment?.canSend === true

  async function onSend() {
    const outcome = await session.applyLighting(lighting.choice)
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    const { result, plan } = outcome.value
    setStatus(resultMessage(result, { what: describe(lighting.choice), written: whatIsWritten(plan), changes: plan.changes.length }))
  }

  return (
    <Pane
      title="lighting"
      meta={boardSummary(board)}
      className={className}
      bodyClassName="flex flex-col gap-4"
      actions={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Read board"
          title="Read the board's lighting again"
          disabled={!ready}
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
          {EFFECTS.map((e) => (
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

      <p className="text-xs text-muted-foreground">{board ? hint(lighting) : 'Connect the board: its lighting is read first, then you can change it.'}</p>

      <div className="flex flex-col items-start gap-2">
        <SendButton dryRun={session.dryRun} disabled={!ready || !board} onClick={() => void onSend()} />
        {status && <p className="text-xs leading-relaxed">{status}</p>}
      </div>
    </Pane>
  )
}
