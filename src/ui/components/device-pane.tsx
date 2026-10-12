import { CircleCheck, CircleDashed, CircleX, Copy, TriangleAlert } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/ui/table'
import { Pane } from '@/ui/components/pane'
import { formatId, type ReportInfo } from '@/transport'
import type { Session } from '@/ui/hooks/use-session'

const hex4 = (n: number) => n.toString(16).padStart(4, '0')

function Reports({ reports }: { reports: ReportInfo[] }) {
  if (reports.length === 0) return <span className="text-muted-foreground">–</span>
  return (
    <span className="flex flex-col">
      {reports.map((r) => (
        <span key={r.id}>
          {formatId(r.id, 2)} <span className="text-muted-foreground">· {r.size} B</span>
        </span>
      ))}
    </span>
  )
}

/** Phase 0 recon: what the board exposes, and whether it passes the checks. */
export function DevicePane({ session, className }: { session: Session; className?: string }) {
  const { device, assessment } = session
  const collections = device?.interfaces.flatMap((i) => i.collections) ?? []
  // The F75 declares no output reports; an all-empty column only costs width.
  const kinds = (['input', 'output', 'feature'] as const).filter((k) => collections.some((c) => c[k].length > 0))

  return (
    <Pane
      title="device"
      meta={device ? `${device.name} · ${hex4(device.vendorId)}:${hex4(device.productId)}` : 'no board'}
      className={className}
      bodyClassName="flex flex-col gap-4 text-sm"
    >
      {!session.webHidSupported && (
        <p className="flex gap-2 text-signal-error">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            WebHID is not available in this browser. Use desktop Chrome or Edge, on https or localhost.
          </span>
        </p>
      )}

      {!device || !assessment ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <p>
            <span className="text-primary">$</span> waiting for a board
          </p>
          <p>Plug the F75 in by cable, switch it to wired mode, then press Connect and pick it in Chrome's prompt.</p>
          <p>The app sends nothing until you connect.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{device.interfaces.length} interface(s) granted</span>
            <Button
              variant="ghost"
              size="xs"
              className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              onClick={() => void navigator.clipboard.writeText(JSON.stringify(device, null, 2))}
            >
              <Copy />
              Copy JSON
            </Button>
          </div>

          <ul className="flex flex-col gap-2">
            {assessment.checks.map((check) => (
              <li key={check.label} className="flex gap-2">
                {check.ok ? (
                  <CircleCheck aria-label="passed" className="mt-0.5 size-4 shrink-0 text-signal-ok" />
                ) : check.pending ? (
                  <CircleDashed aria-label="pending" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <CircleX aria-label="failed" className="mt-0.5 size-4 shrink-0 text-signal-error" />
                )}
                <span>
                  <span>{check.label}</span> <span className="text-muted-foreground">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {assessment.blocked && (
            <p className="border-l-2 border-signal-error pl-2 text-signal-error">{assessment.blocked}</p>
          )}

          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead className="h-7 px-1.5 text-muted-foreground">page:usage</TableHead>
                {kinds.map((k) => (
                  <TableHead key={k} className="h-7 px-1.5 text-muted-foreground">
                    {k}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((c, i) => (
                <TableRow key={i} className="border-hairline align-top hover:bg-accent/40">
                  <TableCell className="px-1.5 py-1">
                    {hex4(c.usagePage)}:{hex4(c.usage)}
                  </TableCell>
                  {kinds.map((k) => (
                    <TableCell key={k} className="px-1.5 py-1">
                      <Reports reports={c[k]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Pane>
  )
}
