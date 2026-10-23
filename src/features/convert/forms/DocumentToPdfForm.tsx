import { useCallback, useEffect, useState } from 'react'
import { Notice } from '../../../components/common/Notice'
import { bridge, errorMessage } from '../../../lib/bridge'
import { SimpleToPdfForm } from './SimpleToPdfForm'

type Status =
  | { state: 'checking' }
  | { state: 'word' }
  | { state: 'libreoffice' }
  | { state: 'missing' }
  | { state: 'error'; message: string }

/**
 * Word converts with Microsoft Word or LibreOffice for exact layout and line breaks.
 * If neither is installed, .docx works with the built-in converter (basic layout).
 */
export function DocumentToPdfForm() {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  const lookup = useCallback(async (): Promise<Status> => {
    try {
      const tools = await bridge.getToolsStatus()
      if (tools.word) return { state: 'word' }
      if (tools.libreoffice) return { state: 'libreoffice' }
      return { state: 'missing' }
    } catch (error) {
      return { state: 'error', message: errorMessage(error) }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void lookup().then((result) => {
      if (!cancelled) setStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [lookup])

  const officeFound = status.state === 'word' || status.state === 'libreoffice'

  return (
    <div className="space-y-6">
      {status.state === 'word' && (
        <p className="text-sm text-muted">
          Microsoft Word was found. It will be used for exact layout, formatting, and line breaks
          matching your Word file.
        </p>
      )}
      {status.state === 'libreoffice' && (
        <p className="text-sm text-muted">
          LibreOffice was found. It will be used for the closest layout, and .doc, .odt and .rtf files
          are supported.
        </p>
      )}
      {status.state === 'missing' && (
        <p className="text-sm text-muted">
          .docx files convert with DocuForge's built-in converter (basic layout). For .doc, .odt and
          .rtf files, save them as .docx in Word first, or install Microsoft Word or the free LibreOffice from
          libreoffice.org.
        </p>
      )}
      {status.state === 'error' && <Notice>{status.message}</Notice>}

      <SimpleToPdfForm
        operation="document_to_pdf"
        kind="document"
        chooseLabel="Choose a document"
        convertLabel="Convert to PDF"
        blockedReason={(file) =>
          !officeFound && status.state !== 'checking' && !file.name.toLowerCase().endsWith('.docx')
            ? `${file.name.slice(file.name.lastIndexOf('.'))} files need Microsoft Word or LibreOffice. Save the file as .docx in Word and convert that, or install Microsoft Word or the free LibreOffice from libreoffice.org.`
            : null
        }
      />
    </div>
  )
}
