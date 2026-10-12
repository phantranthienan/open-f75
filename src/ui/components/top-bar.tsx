import { Plug, Unplug } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import { formatId } from '@/transport'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'
import { useTheme } from '@/ui/hooks/use-theme'

/** One button per theme; each swatch carries its own data-theme, so it shows that theme's accent, ok and warn colours. */
function ThemeSwitch() {
  const { theme, setTheme, themes } = useTheme()
  const active = themes.find((t) => t.id === theme) ?? themes[0]

  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-1.5">
      <span className="hidden text-xs text-muted-foreground md:inline">{active.name.toLowerCase()}</span>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.name}
          aria-pressed={t.id === theme}
          title={t.name}
          onClick={() => setTheme(t.id)}
          className={cn(
            'h-6 w-8 overflow-hidden rounded-sm border transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11 pointer-coarse:w-11',
            t.id === theme && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
          )}
        >
          <span data-theme={t.id} aria-hidden="true" className="flex size-full items-center justify-center gap-0.5 bg-background">
            <span className="h-3 w-1 rounded-full bg-primary" />
            <span className="h-3 w-1 rounded-full bg-signal-ok" />
            <span className="h-3 w-1 rounded-full bg-signal-warn" />
          </span>
        </button>
      ))}
    </div>
  )
}

/** Title bar: the connection light, the theme, the dry-run switch and Connect. */
export function TopBar({ session }: { session: Session }) {
  const { connected, busy, dryRun, device } = session

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-2">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="glow text-sm font-bold tracking-wide text-primary">
          open-f75<span aria-hidden="true">▍</span>
        </h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">aula f75 lighting · webhid</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 text-xs">
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', connected ? 'glow bg-signal-ok text-signal-ok' : 'bg-muted-foreground/60')}
          />
          {connected && device ? (
            <span className="text-signal-ok">
              connected · {formatId(device.vendorId).slice(2).toLowerCase()}:{formatId(device.productId).slice(2).toLowerCase()}
            </span>
          ) : (
            <span className="text-muted-foreground">not connected</span>
          )}
        </span>

        <ThemeSwitch />

        <div className="flex items-center gap-2">
          <Switch
            id="dry-run"
            checked={dryRun}
            disabled={busy}
            onCheckedChange={session.setDryRun}
            className="data-[state=checked]:bg-signal-warn"
          />
          <Label htmlFor="dry-run" className="text-xs">
            Dry run
          </Label>
        </div>

        {connected ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void session.disconnect()}>
            <Unplug />
            Disconnect
          </Button>
        ) : (
          <Button size="sm" disabled={!session.webHidSupported} onClick={() => void session.connect()}>
            <Plug />
            Connect
          </Button>
        )}
      </div>
    </header>
  )
}
