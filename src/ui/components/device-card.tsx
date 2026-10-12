import { CircleCheck, CircleX, Copy, Usb } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table'
import { formatId, type ReportInfo } from '@/transport'
import type { Session } from '@/ui/hooks/use-session'

function Reports({ reports }: { reports: ReportInfo[] }) {
  if (reports.length === 0) return <span className="text-muted-foreground">–</span>
  return (
    <span className="flex flex-col gap-0.5">
      {reports.map((r) => (
        <span key={r.id}>
          {formatId(r.id, 2)} <span className="text-muted-foreground">· {r.size} B</span>
        </span>
      ))}
    </span>
  )
}

/** Phase 0 recon: what the board exposes, and whether it passes the checks. */
export function DeviceCard({ session }: { session: Session }) {
  const { device, assessment } = session

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device</CardTitle>
        <CardDescription>
          {device
            ? `${device.name} · ${formatId(device.vendorId)}:${formatId(device.productId)} · ${device.interfaces.length} interface(s)`
            : 'Plug the F75 in by cable, switch it to wired mode, then Connect.'}
        </CardDescription>
        {device && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(JSON.stringify(device, null, 2))}
            >
              <Copy />
              Copy JSON
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!device || !assessment ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <Usb className="size-5 shrink-0" />
            Chrome lists boards with vendor ID 0x258A. Pick the F75; if it shows up more than once, any entry works.
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2 text-sm">
              {assessment.checks.map((check) => (
                <li key={check.label} className="flex gap-2">
                  {check.ok ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{check.label}</span>{' '}
                    <span className="text-muted-foreground">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {!assessment.canSend && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                A check failed, so the app will not send anything to this device.
              </p>
            )}

            <div className="overflow-x-auto rounded-md border">
              <Table className="font-mono text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>If</TableHead>
                    <TableHead>Usage page</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Output</TableHead>
                    <TableHead>Feature</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {device.interfaces.flatMap((iface, i) =>
                    iface.collections.map((c, j) => (
                      <TableRow key={`${i}-${j}`} className="align-top">
                        <TableCell>{i}</TableCell>
                        <TableCell>{formatId(c.usagePage)}</TableCell>
                        <TableCell>{formatId(c.usage)}</TableCell>
                        <TableCell><Reports reports={c.input} /></TableCell>
                        <TableCell><Reports reports={c.output} /></TableCell>
                        <TableCell><Reports reports={c.feature} /></TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
