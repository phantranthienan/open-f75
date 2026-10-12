import { BackupPane } from '@/ui/components/backup-pane'
import { ColorPane } from '@/ui/components/color-pane'
import { DevicePane } from '@/ui/components/device-pane'
import { LogPane } from '@/ui/components/log-pane'
import { StatusLine } from '@/ui/components/status-line'
import { TopBar } from '@/ui/components/top-bar'
import { useSession } from '@/ui/hooks/use-session'

/**
 * One screen, like a terminal dashboard: device, colour and backup on the
 * left, the packet log on the right, a status line at the bottom. From 1024 px
 * it fits the window and each pane scrolls on its own; narrower, the panes stack.
 */
export default function App() {
  const session = useSession()

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar session={session} />
      <main className="grid flex-1 gap-x-3 gap-y-6 px-3 pt-6 pb-3 md:grid-cols-2 lg:min-h-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.35fr)] lg:grid-rows-[minmax(0,1fr)_auto]">
        <DevicePane session={session} className="lg:row-span-2" />
        <ColorPane session={session} />
        <BackupPane session={session} className="lg:col-start-2" />
        <LogPane session={session} className="h-96 md:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:h-auto" />
      </main>
      <StatusLine session={session} />
    </div>
  )
}
