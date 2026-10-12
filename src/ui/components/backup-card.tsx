import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/components/ui/card'
import type { Backup } from '@/keyboard'
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

export function BackupCard({ session }: { session: Session }) {
  const [status, setStatus] = useState<string | null>(null)
  const canRun = session.connected && !session.busy && session.assessment?.canSend === true

  async function onBackup() {
    const outcome = await session.backup()
    if (!outcome.ok) return setStatus(`Failed: ${outcome.error}`)
    const name = download(outcome.value)
    const config = outcome.value.config ? '10 config frames' : 'no config (read failed)'
    setStatus(`Saved ${name}: ${config}, ${Object.keys(outcome.value.featureReports).length} feature report(s).`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Read before you write. Saves the current config and every feature report as JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {status ?? 'Run this once before the first real write and keep the file.'}
      </CardContent>
      <CardFooter>
        <Button variant="secondary" disabled={!canRun} onClick={() => void onBackup()}>
          <Download />
          Back up config
        </Button>
      </CardFooter>
    </Card>
  )
}
