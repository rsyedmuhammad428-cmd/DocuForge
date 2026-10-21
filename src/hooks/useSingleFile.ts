import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileKind, FileRef, InspectResult } from '../../shared/files'
import { bridge, errorMessage } from '../lib/bridge'

interface SelectedFile {
  ref: FileRef
  /** Only PDFs are checked. undefined while the check runs. */
  check: InspectResult | undefined
}

/**
 * Choosing one file with a native dialog. PDFs are also checked for readability and page count.
 * The main process's file handle is released when the file is replaced or the page is left.
 */
export function useSingleFile(kind: FileKind) {
  const [file, setFile] = useState<SelectedFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const latestId = useRef<string | null>(null)
  useEffect(() => {
    latestId.current = file?.ref.id ?? null
  }, [file])
  useEffect(
    () => () => {
      if (latestId.current !== null) void bridge.releaseFiles([latestId.current]).catch(() => undefined)
    },
    [],
  )

  const choose = useCallback(async () => {
    setMessage(null)
    setBusy(true)
    try {
      const [ref] = await bridge.selectFiles(kind, false)
      if (ref === undefined) return
      if (latestId.current !== null) void bridge.releaseFiles([latestId.current]).catch(() => undefined)
      setFile({ ref, check: undefined })
      if (kind === 'pdf') {
        const [check] = await bridge.inspectPdfs([ref.id])
        setFile({ ref, check })
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [kind])

  const check = file?.check
  const pageCount = check?.ok === true ? check.pageCount : null
  const problem = check?.ok === false ? (check.error?.message ?? 'This file cannot be used.') : null
  /** True when the file can be used: PDFs must pass the check, other kinds are checked by the engine. */
  const usable = file !== null && (kind !== 'pdf' || check?.ok === true)

  return { file, pageCount, problem, usable, busy, message, setMessage, choose }
}
