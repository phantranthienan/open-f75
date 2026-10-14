import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Assessment, IdentityState } from '@/device-check'
import { Keyboard, type ApplyResult, type Backup, type BoardState } from '@/keyboard'
import { createLog } from '@/log'
import type { LightingChoice, LightingPlan } from '@/protocol/lighting'
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
  const [identity, setIdentity] = useState<IdentityState | null>(null)
  /** What the board last returned; null until it has been read. */
  const [board, setBoard] = useState<BoardState | null>(null)
  const keyboardRef = useRef<Keyboard | null>(null)
  const setKeyboard = useCallback((next: Keyboard | null) => {
    keyboardRef.current?.dispose()
    keyboardRef.current = next
    setKeyboardState(next)
    setAssessment(next?.assessment ?? null)
    setIdentity(next?.identity ?? null)
    setBoard(null)
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
      if (keyboardRef.current === kb) {
        setAssessment(kb.assessment)
        setIdentity(kb.identity)
      }
      setBusy(false)
    }
  }, [])

  /**
   * Connects the keyboard layer and sends the one command allowed before
   * identification. Once the board is known to be an F75, reads its lighting
   * so the controls start from what the board shows.
   */
  const attach = useCallback(
    (device: DeviceInfo) => {
      const send = createSafeSend({ transport, log, isDryRun: () => dryRunRef.current })
      const kb = new Keyboard({ transport, send, log, device })
      setKeyboard(kb)
      log.add('info', `Connected via ${transport.name}: ${device.name} (${formatId(device.vendorId)}:${formatId(device.productId)})`)
      if (!kb.assessment.canIdentify) {
        log.add('error', 'The descriptor checks failed; nothing will be sent to this device')
        return
      }
      void run('Identify', async (k) => {
        await k.identify()
        if (k.assessment.canSend) setBoard(await k.readBoard())
      })
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

  const readBoard = useCallback(
    (): Promise<Outcome<BoardState>> =>
      run('Read board', async (kb) => {
        const state = await kb.readBoard()
        setBoard(state)
        return state
      }),
    [run],
  )

  const applyLighting = useCallback(
    (choice: LightingChoice): Promise<Outcome<{ result: ApplyResult; plan: LightingPlan }>> =>
      run('Lighting', async (kb) => {
        const { board: after, ...outcome } = await kb.applyLighting(choice)
        setBoard(after)
        return outcome
      }),
    [run],
  )

  const backup = useCallback((): Promise<Outcome<Backup>> => run('Backup', (kb) => kb.backup()), [run])

  return {
    webHidSupported,
    transportName: transport.name,
    device: keyboard?.device ?? null,
    assessment,
    identity,
    connected: keyboard !== null,
    board,
    busy,
    dryRun,
    setDryRun,
    entries,
    clearLog: log.clear,
    connect,
    disconnect,
    readBoard,
    applyLighting,
    backup,
  }
}

export type Session = ReturnType<typeof useSession>
