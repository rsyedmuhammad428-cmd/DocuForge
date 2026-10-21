import { useCallback, useEffect, useState } from 'react'
import { Notice } from '../../../components/common/Notice'
import { bridge, errorMessage } from '../../../lib/bridge'
import { SimpleToPdfForm } from './SimpleToPdfForm'

type Status = { state: 'checking' } | { state: 'found' } | { state: 'missing' } | { state: 'error'; message: string }

/**
 * .docx works with no extra software (basic layout). LibreOffice, if installed, gives a closer
 * layout and is the only way to convert .doc, .odt and .rtf. This tells the user which applies.
 */
export function DocumentToPdfForm() {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  const lookup = useCallback(async (): Promise<Status> => {
    try {
      const tools = await bridge.getToolsStatus()
      return { state: tools.libreoffice ? 'found' : 'missing' }
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

  const libreOfficeFound = status.state === 'found'

  return (
    <div className="space-y-6">
      {status.state === 'found' && (
        <p className="text-sm text-muted">
          LibreOffice was found. It will be used for the closest layout, and .doc, .odt and .rtf files
          are supported.
        </p>
      )}
      {status.state === 'missing' && (
        <p className="text-sm text-muted">
          .docx files convert with DocuForge's built-in converter (basic layout). For .doc, .odt and
          .rtf files, save them as .docx in Word first, or install the free LibreOffice from
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
          !libreOfficeFound && status.state !== 'checking' && !file.name.toLowerCase().endsWith('.docx')
            ? `${file.name.slice(file.name.lastIndexOf('.'))} files need LibreOffice. Save the file as .docx in Word and convert that, or install the free LibreOffice from libreoffice.org.`
            : null
        }
      />
    </div>
  )
}
