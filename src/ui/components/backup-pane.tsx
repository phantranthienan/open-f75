import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import type { Backup } from '@/keyboard'
import { Pane } from '@/ui/components/pane'
import type { Session } from '@/ui/hooks/use-session'

function download(backup: Backup): string {
  const stamp = backup.createdAt.replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const name = `open-f75-backup-${stamp}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
  return name
}

export function BackupPane({ session, className }: { session: Session; className?: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const canRun = session.connected && !session.busy && session.assessment?.canSend === true

  async function onBackup() {
    const outcome = await session.backup()
    if (!outcome.ok) return setStatus(`Failed: ${outcome.error}`)
    const name = download(outcome.value)
    const failed = Object.keys(outcome.value.errors)
    setStatus(failed.length ? `Saved ${name}, but these reads failed: ${failed.join(', ')}.` : `Saved ${name}.`)
  }

  return (
    <Pane title="backup" meta="reads only" className={className} bodyClassName="flex flex-col items-start gap-3 text-xs">
      <p className="text-muted-foreground">
        Read before you write: saves the identity, the 128-byte settings page, the 512-byte colour table and the 378 bytes of per-key colours as JSON.
      </p>
      <Button variant="secondary" size="sm" disabled={!canRun} onClick={() => void onBackup()}>
        <Download />
        Back up config
      </Button>
      {status && <p>{status}</p>}
    </Pane>
  )
}
