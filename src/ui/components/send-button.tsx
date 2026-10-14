import { FlaskConical, Send } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { cn } from '@/ui/lib/utils'

/**
 * The button that writes to the board: amber "Dry run …" while dry run is on,
 * "Send …" otherwise. `label` names what it sends (empty for the lighting).
 */
export function SendButton({
  dryRun,
  label = '',
  disabled,
  onClick,
  size,
}: {
  dryRun: boolean
  label?: string
  disabled: boolean
  onClick: () => void
  size?: 'sm'
}) {
  return (
    <Button
      size={size}
      disabled={disabled}
      onClick={onClick}
      variant={dryRun ? 'outline' : 'default'}
      className={cn(dryRun && 'border-signal-warn text-signal-warn hover:bg-signal-warn/10 hover:text-signal-warn')}
    >
      {dryRun ? <FlaskConical /> : <Send />}
      {dryRun ? `Dry run${label ? ` ${label}` : ''}` : `Send ${label || 'to keyboard'}`}
    </Button>
  )
}
