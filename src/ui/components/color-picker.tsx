import { BookmarkPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { parseHexColor } from '@/protocol/bytes'
import { ColorWheel } from '@/ui/components/color-wheel'
import { useSavedColors } from '@/ui/hooks/use-saved-colors'
import { isHexColor } from '@/ui/lib/color'

/** The wheel, the hex field and the user's saved colours. Colours come only from these (no presets). */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // The hex field keeps what is typed until it is a whole colour.
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setDraft(value)
  }
  const saved = useSavedColors()

  function pick(next: string) {
    setDraft(next)
    if (isHexColor(next)) onChange(next.toLowerCase())
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ColorWheel value={value} onChange={pick} size={136} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div aria-hidden="true" className="h-9 rounded-sm border" style={{ backgroundColor: value }} />
          <Label htmlFor="hex" className="text-xs text-muted-foreground">
            Hex
          </Label>
          <Input
            id="hex"
            value={draft}
            onChange={(e) => pick(e.target.value)}
            aria-invalid={!isHexColor(draft)}
            className="h-8 font-mono text-sm"
            spellCheck={false}
          />
          <span className="truncate text-xs text-muted-foreground">rgb({parseHexColor(value).join(', ')})</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs text-muted-foreground">
            saved · {saved.colors.length}/{saved.limit}
          </h3>
          <Button variant="secondary" size="xs" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={() => saved.save(value)}>
            <BookmarkPlus />
            Save colour
          </Button>
        </div>
        {saved.colors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing saved yet. Kept in this browser only.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {saved.colors.map((hex) => (
              <li key={hex} className="flex items-center rounded-sm border">
                <button
                  type="button"
                  aria-label={`Use ${hex}`}
                  title={hex}
                  onClick={() => pick(hex)}
                  className="flex items-center gap-1.5 px-1.5 py-1 text-xs transition-colors hover:bg-accent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  <span aria-hidden="true" className="size-4 rounded-sm border" style={{ backgroundColor: hex }} />
                  {hex}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${hex}`}
                  title={`Remove ${hex}`}
                  onClick={() => saved.remove(hex)}
                  className="flex items-center justify-center border-l px-1 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
