import { useId } from 'react'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import { MAX_BRIGHTNESS, MAX_SPEED } from '@/protocol/effects'
import { LIGHTING_EFFECTS, type Lighting } from '@/ui/hooks/use-lighting'
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

/** Effect mode: the effect, Colourful where it can cycle colours, then brightness and speed. */
export function EffectControls({ lighting }: { lighting: Lighting }) {
  const { effect } = lighting
  return (
    <div className="flex flex-col gap-3">
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
    </div>
  )
}
