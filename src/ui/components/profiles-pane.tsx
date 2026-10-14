import { FolderUp, Save, Upload, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { errorMessage } from '@/log'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { MAX_BRIGHTNESS, effectByValue } from '@/protocol/effects'
import { colorSetting } from '@/protocol/lighting'
import { MAX_NAME_LENGTH, makeProfile, parseProfilesFile, profileKeys, toProfilesFile, type Profile } from '@/profiles'
import { Pane } from '@/ui/components/pane'
import type { KeyColorsDraft } from '@/ui/hooks/use-key-colors'
import type { Lighting } from '@/ui/hooks/use-lighting'
import { useProfiles } from '@/ui/hooks/use-profiles'
import { downloadText, fileStamp } from '@/ui/lib/download'

/** "Breathing · 3/9 · #123456 · 1 key". */
function summary(p: Profile): string {
  const effect = effectByValue(p.effect)
  const parts = [effect.name]
  if (effect.brightness) parts.push(`${p.brightness}/${MAX_BRIGHTNESS}`)
  const color = colorSetting({ effect, colorful: p.colorful, color: parseHexColor(p.color) })
  if (color === 'colorful') parts.push('colourful')
  else if (color !== null) parts.push(formatHexColor(color))
  const keys = Object.keys(p.keys).length
  if (keys) parts.push(`${keys} key${keys === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/**
 * Phase 3: the controls saved under a name in this browser, plus JSON export
 * and import. Loading a profile fills the controls; Send still decides.
 */
export function ProfilesPane({ lighting, keys, className }: { lighting: Lighting; keys: KeyColorsDraft; className?: string }) {
  const { profiles, add, remove } = useProfiles()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function onSave(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const replaced = profiles.some((p) => p.name === trimmed)
    add([makeProfile(trimmed, lighting.controls, keys.colors)])
    setStatus(`${replaced ? 'Replaced' : 'Saved'} "${trimmed}".`)
  }

  function onLoad(p: Profile) {
    lighting.loadControls(p)
    keys.replace(profileKeys(p))
    setStatus(`Loaded "${p.name}" into the controls. Send from the lighting or keys pane to put it on the board.`)
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const incoming = parseProfilesFile(await file.text())
      add(incoming)
      setStatus(`Imported ${incoming.length} profile(s) from ${file.name}.`)
    } catch (err) {
      setStatus(`Import failed: ${errorMessage(err)}`)
    } finally {
      if (fileInput.current) fileInput.current.value = '' // the same file can be picked again
    }
  }

  function onExport() {
    const fileName = `open-f75-profiles-${fileStamp(new Date().toISOString())}.json`
    downloadText(fileName, toProfilesFile(profiles))
    setStatus(`Saved ${profiles.length} profile(s) to ${fileName}.`)
  }

  return (
    <Pane title="profiles" meta={`${profiles.length} saved · this browser`} className={className} bodyClassName="flex flex-col gap-3 text-xs">
      <form onSubmit={onSave} className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="profile-name" className="text-xs text-muted-foreground">
            Profile name
          </Label>
          <Input
            id="profile-name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. evening"
            className="h-8 text-sm"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={!name.trim()}>
          <Save />
          Save profile
        </Button>
      </form>

      {profiles.length === 0 ? (
        <p className="text-muted-foreground">No profiles yet. A profile keeps the effect, its controls, the colour and the key colours.</p>
      ) : (
        <ul className="flex max-h-40 flex-col divide-y divide-hairline overflow-y-auto">
          {profiles.map((p) => (
            <li key={p.name} className="flex items-center gap-2 py-1">
              <button
                type="button"
                aria-label={`Load ${p.name}`}
                onClick={() => onLoad(p)}
                className="flex min-w-0 flex-1 flex-col items-start rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-accent pointer-coarse:min-h-11"
              >
                <span className="truncate">{p.name}</span>
                <span className="truncate text-muted-foreground">{summary(p)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${p.name}`}
                title={`Delete ${p.name}`}
                className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                onClick={() => remove(p.name)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="xs" disabled={profiles.length === 0} onClick={onExport} className="pointer-coarse:min-h-11">
          <Upload />
          Export profiles
        </Button>
        <Button variant="ghost" size="xs" onClick={() => fileInput.current?.click()} className="pointer-coarse:min-h-11">
          <FolderUp />
          Import profiles
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Profiles file to import"
          className="hidden"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
      </div>
      {status && <p className="leading-relaxed">{status}</p>}
    </Pane>
  )
}
