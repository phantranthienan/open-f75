import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Assessment } from '@/device-check'
import { Keyboard, type Backup, type ColorResult } from '@/keyboard'
import { createLog } from '@/log'
import type { Rgb } from '@/protocol/bytes'
import type { StaticColorPlan } from '@/protocol/settings'
import { createSafeSend } from '@/safe-send'
import { formatId, type DeviceInfo } from '@/transport'
import { WebHidTransport, isWebHidSupported } from '@/transports/webhid'

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

const log = createLog()

/** Wires transport, guard and keyboard together for the UI. */
export function useSession() {
  const webHidSupported = useMemo(() => isWebHidSupported(), [])
  const transport = useMemo(() => new WebHidTransport(), [])
  const [keyboard, setKeyboardState] = useState<Keyboard | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const keyboardRef = useRef<Keyboard | null>(null)
  const setKeyboard = useCallback((next: Keyboard | null) => {
    keyboardRef.current?.dispose()
    keyboardRef.current = next
    setKeyboardState(next)
    setAssessment(next?.assessment ?? null)
  }, [])
  const [busy, setBusy] = useState(false)

  // Dry run always starts on. The guard reads the ref, so a toggle applies to the next packet.
  const [dryRun, setDryRunState] = useState(true)
  const dryRunRef = useRef(dryRun)
  const setDryRun = useCallback((value: boolean) => {
    dryRunRef.current = value
    setDryRunState(value)
    log.add('info', value ? 'Dry run on: writes are logged, not sent' : 'Dry run off: writes go to the board')
  }, [])

  const entries = useSyncExternalStore(log.subscribe, log.entries)

  const run = useCallback(async <T>(label: string, task: (kb: Keyboard) => Promise<T>): Promise<Outcome<T>> => {
    const kb = keyboardRef.current
    if (!kb) return { ok: false, error: 'Not connected' }
    setBusy(true)
    try {
      return { ok: true, value: await task(kb) }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      log.add('error', `${label}: ${error}`)
      return { ok: false, error }
    } finally {
      if (keyboardRef.current === kb) setAssessment(kb.assessment)
      setBusy(false)
    }
  }, [])

  /** Connects the keyboard layer, then sends the one command allowed before identification. */
  const attach = useCallback(
    (device: DeviceInfo) => {
      const send = createSafeSend({ transport, log, isDryRun: () => dryRunRef.current })
      const kb = new Keyboard({ transport, send, log, device })
      setKeyboard(kb)
      log.add('info', `Connected via ${transport.name}: ${device.name} (${formatId(device.vendorId)}:${formatId(device.productId)})`)
      if (kb.assessment.canIdentify) void run('Identify', (k) => k.identify())
      else log.add('error', 'The descriptor checks failed; nothing will be sent to this device')
    },
    [transport, setKeyboard, run],
  )

  // No automatic reconnect: the board is only opened by a click on Connect, after
  // every page load. This only reacts to the board going away, and closes it on unmount.
  useEffect(() => {
    if (!webHidSupported) return
    const stopDisconnect = transport.onDisconnect(() => {
      setKeyboard(null)
      log.add('info', 'Device disconnected')
    })
    return () => {
      stopDisconnect()
      setKeyboard(null)
      void transport.disconnect()
    }
  }, [webHidSupported, transport, setKeyboard])

  const connect = useCallback(async () => {
    try {
      attach(await transport.connect())
    } catch (err) {
      // Closing the WebHID chooser rejects with NotFoundError; that is not worth an error line.
      const message = err instanceof Error ? err.message : String(err)
      log.add(err instanceof DOMException && err.name === 'NotFoundError' ? 'info' : 'error', `Connect: ${message}`)
    }
  }, [transport, attach])

  const disconnect = useCallback(async () => {
    setKeyboard(null)
    await transport.disconnect()
    log.add('info', 'Disconnected')
  }, [transport, setKeyboard])

  const setStaticColor = useCallback(
    (rgb: Rgb): Promise<Outcome<{ result: ColorResult; plan: StaticColorPlan }>> =>
      run('Static colour', (kb) => kb.setStaticColor(rgb)),
    [run],
  )

  const backup = useCallback((): Promise<Outcome<Backup>> => run('Backup', (kb) => kb.backup()), [run])

  return {
    webHidSupported,
    transportName: transport.name,
    device: keyboard?.device ?? null,
    assessment,
    connected: keyboard !== null,
    busy,
    dryRun,
    setDryRun,
    entries,
    clearLog: log.clear,
    connect,
    disconnect,
    setStaticColor,
    backup,
  }
}

export type Session = ReturnType<typeof useSession>
