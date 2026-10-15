import { describeChoice, type LightingChoice } from '@/protocol/lighting'
import { KeyMap } from '@/ui/components/key-map'
import { useEffectAnimation } from '@/ui/hooks/use-effect-animation'
import { brightnessLevel, frameColors, previewColors } from '@/ui/lib/preview'

/**
 * Effect mode's key map: the choice playing as AULA's own app previews it
 * (lib/animations), or a still picture when the system asks for reduced
 * motion. A component of its own, so each frame redraws only the map.
 */
export function EffectPreview({ choice }: { choice: LightingChoice }) {
  const animation = useEffectAnimation(choice)
  const colors = animation.frame ? frameColors(animation.frame, brightnessLevel(choice)) : previewColors(choice)
  // Effects with a speed move; Fixed on and Off don't.
  let caption = `preview of ${describeChoice(choice)}`
  if (choice.effect.speed) caption += animation.frame ? ", as AULA's app animates it" : ', which moves on the board'
  if (animation.reacts) caption += ' · type or click keys'

  return (
    <div className="flex flex-col gap-1.5">
      <KeyMap
        colors={colors}
        label={`Preview: ${describeChoice(choice)}`}
        onPress={animation.reacts ? (k) => animation.press(k.led) : undefined}
        className="w-full min-w-0"
      />
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}
