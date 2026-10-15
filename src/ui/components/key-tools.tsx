import { Brush, Eraser, PaintBucket, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { F75_KEYS } from '@/protocol/keys'
import type { KeyColorsDraft } from '@/ui/hooks/use-key-colors'
import { cn } from '@/ui/lib/utils'

export type Tool = 'paint' | 'erase'

/** Per-key mode: Paint or Erase for the map, and the whole-board tools. They paint with the picked colour. */
export function KeyTools({
  tool,
  onTool,
  keys,
  paintColor,
}: {
  tool: Tool
  onTool: (tool: Tool) => void
  keys: KeyColorsDraft
  paintColor: string
}) {
  const lit = F75_KEYS.filter((k) => keys.colors.has(k.led)).length
  const toolButton = (value: Tool, label: string, Icon: typeof Brush) => (
    <Button
      variant={tool === value ? 'secondary' : 'ghost'}
      size="xs"
      aria-pressed={tool === value}
      onClick={() => onTool(value)}
      className={cn('pointer-coarse:min-h-11', tool === value && 'ring-1 ring-primary')}
    >
      <Icon />
      {label}
    </Button>
  )

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-1">
        {toolButton('paint', 'Paint', Brush)}
        {toolButton('erase', 'Erase', Eraser)}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="xs" className="pointer-coarse:min-h-11" onClick={() => keys.fill(paintColor)}>
          <PaintBucket />
          Fill all
        </Button>
        <Button variant="ghost" size="xs" className="pointer-coarse:min-h-11" onClick={keys.clear}>
          <Trash2 />
          Clear all
        </Button>
        <Button variant="ghost" size="xs" className="pointer-coarse:min-h-11" disabled={!keys.revert} onClick={() => keys.revert?.()}>
          <RotateCcw />
          Board's colours
        </Button>
      </div>
      <p className="text-muted-foreground">
        {lit} of {F75_KEYS.length} lit · click, drag or press Enter on a key to paint it
      </p>
    </div>
  )
}
