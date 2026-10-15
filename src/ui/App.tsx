import { BackupPane } from '@/ui/components/backup-pane'
import { DevicePane } from '@/ui/components/device-pane'
import { LightingPane } from '@/ui/components/lighting-pane'
import { LogPane } from '@/ui/components/log-pane'
import { ProfilesPane } from '@/ui/components/profiles-pane'
import { StatusLine } from '@/ui/components/status-line'
import { TopBar } from '@/ui/components/top-bar'
import { useKeyColors } from '@/ui/hooks/use-key-colors'
import { useLighting } from '@/ui/hooks/use-lighting'
import { useSession } from '@/ui/hooks/use-session'

/**
 * One screen, like a terminal dashboard: device and backup on the left, the
 * lighting (effects and the key painter) wide in the middle, profiles and the
 * packet log on the right, and a status line under them. From 1024 px it fits
 * the window and each pane scrolls on its own; narrower, the lighting comes
 * first, full width, and the others follow.
 */
export default function App() {
  const session = useSession()
  const lighting = useLighting(session.board)
  const keys = useKeyColors(session.board)

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar session={session} />
      <main className="grid flex-1 gap-x-3 gap-y-6 px-3 pt-6 pb-3 md:grid-cols-2 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1.1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-6 md:row-start-2 lg:col-start-1 lg:row-start-1">
          <DevicePane session={session} className="flex-1" />
          <BackupPane session={session} />
        </div>
        <LightingPane
          session={session}
          lighting={lighting}
          keys={keys}
          className="md:col-span-2 md:row-start-1 lg:col-span-1 lg:col-start-2"
        />
        <div className="flex min-h-0 flex-col gap-6 md:row-start-2 lg:col-start-3 lg:row-start-1">
          <ProfilesPane lighting={lighting} keys={keys} />
          <LogPane entries={session.entries} onClear={session.clearLog} className="h-96 lg:h-auto lg:flex-1" />
        </div>
      </main>
      <StatusLine session={session} />
    </div>
  )
}
