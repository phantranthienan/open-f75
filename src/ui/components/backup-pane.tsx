import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import type { Backup } from '@/keyboard'
import { Pane } from '@/ui/components/pane'
import type { Session } from '@/ui/hooks/use-session'
import { downloadText, fileStamp } from '@/ui/lib/download'

function download(backup: Backup): string {
  const name = `open-f75-backup-${fileStamp(backup.createdAt)}.json`
  downloadText(name, JSON.stringify(backup, null, 2))
  return name
}

export function BackupPane({ session, className }: { session: Session; className?: string }) {
  const [status, setStatus] = useState<string | null>(null)

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
      <Button variant="secondary" size="sm" disabled={!session.canSend} onClick={() => void onBackup()}>
        <Download />
        Back up config
      </Button>
      {status && <p>{status}</p>}
    </Pane>
  )
}
