import { Plug, Unplug } from 'lucide-react'
import { Button } from '@/ui/components/ui/button'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import { formatId } from '@/transport'
import { cn } from '@/ui/lib/utils'
import type { Session } from '@/ui/hooks/use-session'
import { useTheme } from '@/ui/hooks/use-theme'

const REPO_URL = 'https://github.com/phantranthienan/open-f75'

/** GitHub's mark (Octicons mark-github, MIT); lucide no longer ships brand icons. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}

/** One button per theme; each swatch carries its own data-theme, so it shows that theme's accent, ok and warn colours. */
function ThemeSwitch() {
  const { theme, setTheme, themes } = useTheme()
  const active = themes.find((t) => t.id === theme) ?? themes[0]

  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-1.5">
      <span className="hidden text-xs text-muted-foreground md:inline">{active.name.toLowerCase()}</span>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.name}
          aria-pressed={t.id === theme}
          title={t.name}
          onClick={() => setTheme(t.id)}
          className={cn(
            'h-6 w-8 overflow-hidden rounded-sm border transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:h-11 pointer-coarse:w-11',
            t.id === theme && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
          )}
        >
          <span data-theme={t.id} aria-hidden="true" className="flex size-full items-center justify-center gap-0.5 bg-background">
            <span className="h-3 w-1 rounded-full bg-primary" />
            <span className="h-3 w-1 rounded-full bg-signal-ok" />
            <span className="h-3 w-1 rounded-full bg-signal-warn" />
          </span>
        </button>
      ))}
    </div>
  )
}

/** Title bar: the name and a link to the source, then the connection light, the theme, the dry-run switch and Connect. */
export function TopBar({ session }: { session: Session }) {
  const { connected, busy, dryRun, device } = session

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-2">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="glow text-sm font-bold tracking-wide text-primary">
          open-f75<span aria-hidden="true">▍</span>
        </h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">aula f75 lighting · webhid</span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
          className="flex items-center gap-1.5 self-center rounded-sm text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
        >
          <GitHubMark className="size-3.5" />
          <span className="hidden md:inline">source</span>
        </a>
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

        <ThemeSwitch />

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
