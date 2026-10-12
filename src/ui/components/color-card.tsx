import { FlaskConical, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/components/ui/card'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { COLOR_NAMES, FIRMWARE_COLORS } from '@/protocol/settings'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'

// The seven firmware colours, red first: the roadmap's first live test.
const PRESETS = FIRMWARE_COLORS.map(formatHexColor)

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

/** Phase 2: one fixed colour, saved on the board. */
export function ColorCard({ session }: { session: Session }) {
  const [color, setColor] = useState('#ff0000')
  const [draft, setDraft] = useState(color)
  const [status, setStatus] = useState<string | null>(null)
  const canSend = session.connected && !session.busy && session.assessment?.canSend === true
  const firmwareIndex = PRESETS.indexOf(color)

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
    <Card>
      <CardHeader>
        <CardTitle>Static colour</CardTitle>
        <CardDescription>
          Sets the "Fixed on" effect: reads the settings page and colour table, patches the bytes that need
          changing, writes them back, then reads them again to check.
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
          {PRESETS.map((preset, i) => (
            <button
              key={preset}
              type="button"
              title={`${COLOR_NAMES[i]} ${preset}`}
              aria-label={`Use ${COLOR_NAMES[i]}`}
              onClick={() => pick(preset)}
              className={cn(
                'size-7 rounded-md border shadow-xs transition-transform hover:scale-110',
                preset === color && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {firmwareIndex >= 0
            ? `Firmware colour ${firmwareIndex} (${COLOR_NAMES[firmwareIndex]}): normally one byte in the settings page, the path AulaSofwareLinux confirmed on an F75.`
            : 'Custom colour: also writes the colour table. Not yet confirmed on an F75, and only done if your board\'s table has the expected layout.'}
        </p>

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
