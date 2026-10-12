import { Keyboard, Plug, Unplug } from 'lucide-react'
import { Badge } from '@/ui/components/ui/badge'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import type { Session } from '@/ui/hooks/use-session'

export function AppHeader({ session }: { session: Session }) {
  const { connected, busy, dryRun } = session

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Keyboard className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base leading-tight font-semibold">open-f75</h1>
          <p className="truncate text-xs text-muted-foreground">AULA F75 lighting controller</p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch id="dry-run" checked={dryRun} disabled={busy} onCheckedChange={session.setDryRun} />
          <Label htmlFor="dry-run">Dry run</Label>
        </div>

        <Badge variant={connected ? 'default' : 'outline'} className="hidden sm:inline-flex">
          {connected ? `${session.transportName} connected` : 'Not connected'}
        </Badge>

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
