import { useState } from 'react'
import { CONVERSIONS, type ConversionId } from './conversions'
import { DocumentToPdfForm } from './forms/DocumentToPdfForm'
import { ImagesToPdfForm } from './forms/ImagesToPdfForm'
import { PdfToImagesForm } from './forms/PdfToImagesForm'
import { PdfToTextForm } from './forms/PdfToTextForm'
import { PdfToWordForm } from './forms/PdfToWordForm'
import { SimpleToPdfForm } from './forms/SimpleToPdfForm'

function ConversionForm({ id }: { id: ConversionId }) {
  switch (id) {
    case 'pdf-to-images':
      return <PdfToImagesForm />
    case 'images-to-pdf':
      return <ImagesToPdfForm />
    case 'pdf-to-text':
      return <PdfToTextForm />
    case 'text-to-pdf':
      return (
        <SimpleToPdfForm
          operation="text_to_pdf"
          kind="text"
          chooseLabel="Choose a text file"
          convertLabel="Convert to PDF"
        />
      )
    case 'document-to-pdf':
      return <DocumentToPdfForm />
    case 'pdf-to-word':
      return <PdfToWordForm />
  }
}

export function ConvertPage() {
  const [selected, setSelected] = useState<ConversionId>('pdf-to-images')
  const current = CONVERSIONS.find((conversion) => conversion.id === selected)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Convert between PDF and other formats. Results are saved on this computer, in the place you
        choose. Your original files are never changed.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-base font-semibold">Convert</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONVERSIONS.map((conversion) => (
            <label
              key={conversion.id}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3 has-checked:border-accent has-checked:bg-subtle has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="conversion"
                value={conversion.id}
                checked={selected === conversion.id}
                onChange={() => setSelected(conversion.id)}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="block font-medium">{conversion.label}</span>
                <span className="block text-sm text-muted">{conversion.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {current !== undefined && (
        <p className="text-sm text-muted">
          <span className="font-medium text-fg">Good to know: </span>
          {current.limitation}
        </p>
      )}

      {/* The key gives each conversion a fresh form, so files from another one are released. */}
      <ConversionForm key={selected} id={selected} />

    </div>
  )
}
