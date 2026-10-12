import { FlaskConical, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/components/ui/card'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { formatHexColor, parseHexColor } from '@/protocol'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'

// Red first: the roadmap's first live test.
const PRESETS = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ffb000', '#00ffff', '#ff00ff']

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

/** Phase 2: one fixed colour, saved on the board. */
export function ColorCard({ session }: { session: Session }) {
  const [color, setColor] = useState('#ff0000')
  const [draft, setDraft] = useState(color)
  const [status, setStatus] = useState<string | null>(null)
  const canSend = session.connected && !session.busy && session.assessment?.canSend === true

  function pick(value: string) {
    setDraft(value)
    if (isHexColor(value)) setColor(value.toLowerCase())
  }

  async function onSend() {
    const outcome = await session.setStaticColor(parseHexColor(color))
    if (!outcome.ok) return setStatus(`Stopped: ${outcome.error}`)
    setStatus(
      outcome.value === 'dry-run'
        ? `Dry run: config read for real, 48 write frames logged for ${color}. Check them, then turn dry run off.`
        : `Saved ${color} to the board. Unplug and replug to check that it sticks.`,
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Static colour</CardTitle>
        <CardDescription>
          Sets the "Fixed on" effect and saves it: read config, 10 config writes, 37 palette writes, save.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label
            className="relative size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border shadow-xs"
            style={{ backgroundColor: color }}
          >
            <input
              type="color"
              aria-label="Colour picker"
              value={color}
              onChange={(e) => pick(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hex">Hex</Label>
            <Input
              id="hex"
              value={draft}
              onChange={(e) => pick(e.target.value)}
              aria-invalid={!isHexColor(draft)}
              className="w-32 font-mono"
              spellCheck={false}
            />
          </div>
          <div className="font-mono text-xs text-muted-foreground">rgb({parseHexColor(color).join(', ')})</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              title={preset}
              aria-label={`Use ${preset}`}
              onClick={() => pick(preset)}
              className={cn(
                'size-7 rounded-md border shadow-xs transition-transform hover:scale-110',
                preset === color && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>

        {session.mockState && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 rounded-sm border" style={{ backgroundColor: formatHexColor(session.mockState.color) }} />
            Mock board: effect {session.mockState.effect}, colour {formatHexColor(session.mockState.color)},{' '}
            {session.mockState.saves} save(s)
          </div>
        )}

        {status && <p className="text-sm">{status}</p>}
      </CardContent>

      <CardFooter>
        <Button disabled={!canSend} onClick={() => void onSend()}>
          {session.dryRun ? <FlaskConical /> : <Send />}
          {session.dryRun ? 'Dry run' : 'Send to keyboard'}
        </Button>
      </CardFooter>
    </Card>
  )
}
