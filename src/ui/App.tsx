import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/ui/components/ui/alert'
import { AppHeader } from '@/ui/components/app-header'
import { BackupCard } from '@/ui/components/backup-card'
import { ColorCard } from '@/ui/components/color-card'
import { DeviceCard } from '@/ui/components/device-card'
import { PacketLog } from '@/ui/components/packet-log'
import { useSession } from '@/ui/hooks/use-session'

export default function App() {
  const session = useSession()

  return (
    <div className="min-h-dvh">
      <AppHeader session={session} />

      <main className="mx-auto grid max-w-7xl gap-4 p-4 sm:p-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {session.kind === 'webhid' && !session.webHidSupported && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>WebHID is not available in this browser</AlertTitle>
              <AlertDescription>
                Use desktop Chrome or Edge on https or localhost, or switch on the mock keyboard.
              </AlertDescription>
            </Alert>
          )}
          {!session.dryRun && session.connected && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Dry run is off</AlertTitle>
              <AlertDescription>Writes go to the board. Stay in wired mode and do not unplug mid-write.</AlertDescription>
            </Alert>
          )}
          <DeviceCard session={session} />
          <BackupCard session={session} />
          <ColorCard session={session} />
        </div>

        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <PacketLog session={session} />
        </div>
      </main>
    </div>
  )
}
