import { BookmarkPlus, FlaskConical, Send, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { COLOR_NAMES, FIRMWARE_COLORS } from '@/protocol/settings'
import { ColorWheel } from '@/ui/components/color-wheel'
import { Pane } from '@/ui/components/pane'
import { useSavedColors } from '@/ui/hooks/use-saved-colors'
import type { Session } from '@/ui/hooks/use-session'
import { cn } from '@/ui/lib/utils'

const FIRMWARE_HEX = FIRMWARE_COLORS.map(formatHexColor)
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

/** Phase 2: one fixed colour, saved on the board. */
export function ColorPane({ session, className }: { session: Session; className?: string }) {
  const [color, setColor] = useState('#ff0000')
  const [draft, setDraft] = useState(color)
  const [status, setStatus] = useState<string | null>(null)
  const saved = useSavedColors()
  const canSend = session.connected && !session.busy && session.assessment?.canSend === true
  const firmwareIndex = FIRMWARE_HEX.indexOf(color)

  function pick(value: string) {
    setDraft(value)
    if (isHexColor(value)) setColor(value.toLowerCase())
  }

  async function onSend() {
    const outcome = await session.setStaticColor(parseHexColor(color))
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    const { result, plan } = outcome.value
    const what = plan.custom ? 'custom colour, colour table + settings page' : `firmware colour, settings page only`
    setStatus(
      result === 'unchanged'
        ? `The board already shows ${color} on Fixed on. Nothing was written.`
        : result === 'dry-run'
          ? `Dry run (${what}): ${plan.changes.length} byte(s) would change, listed in the log. Turn dry run off to send.`
          : `Saved ${color} (${what}) and read it back. Unplug and replug to check that it sticks.`,
    )
  }

  return (
    <Pane title="colour" meta="effect: fixed on" className={className} bodyClassName="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ColorWheel value={color} onChange={pick} size={136} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div aria-hidden="true" className="h-9 rounded-sm border" style={{ backgroundColor: color }} />
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
          <span className="truncate text-xs text-muted-foreground">rgb({parseHexColor(color).join(', ')})</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs text-muted-foreground">
            saved · {saved.colors.length}/{saved.limit}
          </h3>
          <Button variant="secondary" size="xs" className="pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={() => saved.save(color)}>
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

      <p className="text-xs text-muted-foreground">
        {firmwareIndex >= 0
          ? `firmware colour ${firmwareIndex} (${COLOR_NAMES[firmwareIndex]}) · normally one settings byte, confirmed on an F75`
          : 'custom colour · also writes the colour table, only if your board\'s table has the expected layout'}
      </p>

      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={!canSend}
          onClick={() => void onSend()}
          variant={session.dryRun ? 'outline' : 'default'}
          className={cn(session.dryRun && 'border-signal-warn text-signal-warn hover:bg-signal-warn/10 hover:text-signal-warn')}
        >
          {session.dryRun ? <FlaskConical /> : <Send />}
          {session.dryRun ? 'Dry run' : 'Send to keyboard'}
        </Button>
        {status && <p className="text-xs leading-relaxed">{status}</p>}
      </div>
    </Pane>
  )
}
