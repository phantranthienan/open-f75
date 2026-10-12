import { Plug, Unplug } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import { formatId } from '@/transport'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'

/** Title bar: the connection light, the dry-run switch and Connect. */
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
