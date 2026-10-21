import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileRef } from '../../../../shared/files'
import { Button } from '../../../components/common/Button'
import { IconButton } from '../../../components/common/IconButton'
import { Notice } from '../../../components/common/Notice'
import { JobStatusPanel } from '../../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../../hooks/useJobRunner'
import { bridge, errorMessage } from '../../../lib/bridge'
import { formatBytes, pluralize } from '../../../lib/format'
import { moveItem } from '../../../lib/list'

export function ImagesToPdfForm() {
  const runner = useJobRunner()
  const [images, setImages] = useState<FileRef[]>([])
  const [pageSize, setPageSize] = useState<'a4' | 'match'>('a4')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const latest = useRef<FileRef[]>([])
  useEffect(() => {
    latest.current = images
  }, [images])
  useEffect(
    () => () => {
      const ids = latest.current.map((image) => image.id)
      if (ids.length > 0) void bridge.releaseFiles(ids).catch(() => undefined)
    },
    [],
  )

  async function addImages() {
    setMessage(null)
    setAdding(true)
    try {
      const added = await bridge.selectFiles('image', true)
      setImages((previous) => [...previous, ...added])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  function remove(id: string) {
    setImages((previous) => previous.filter((image) => image.id !== id))
    void bridge.releaseFiles([id]).catch(() => undefined)
  }

  function convert() {
    void runner.start(async () => {
      const output = await bridge.selectOutputFile('images.pdf')
      if (output === null) return null
      return { operation: 'images_to_pdf', inputIds: images.map((image) => image.id), outputId: output.id, pageSize }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="primary" onClick={() => void addImages()} disabled={adding || runner.locked}>
          <ImagePlus size={18} aria-hidden="true" />
          Add images
        </Button>
      </div>
      {message !== null && <Notice>{message}</Notice>}

      {images.length > 0 && (
        <section aria-labelledby="images-heading" className="space-y-3">
          <h3 id="images-heading" className="text-base font-semibold">
            Images (one per page, in this order)
          </h3>
          <ol className="divide-y divide-border rounded-card border border-border bg-surface">
            {images.map((image, index) => (
              <li key={image.id} className="flex items-center gap-3 p-3">
                <span className="w-6 shrink-0 text-center text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{image.name}</p>
                  <p className="text-sm text-muted">{formatBytes(image.sizeBytes)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton
                    label={`Move ${image.name} up`}
                    disabled={index === 0 || runner.locked}
                    onClick={() => setImages((previous) => moveItem(previous, index, index - 1))}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Move ${image.name} down`}
                    disabled={index === images.length - 1 || runner.locked}
                    onClick={() => setImages((previous) => moveItem(previous, index, index + 1))}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Remove ${image.name}`} disabled={runner.locked} onClick={() => remove(image.id)}>
                    <X size={16} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-1">
            <label htmlFor="page-size" className="block font-medium">
              Page size
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(event) => setPageSize(event.target.value === 'match' ? 'match' : 'a4')}
              disabled={runner.locked}
              className="w-full max-w-xs rounded-control border border-border bg-surface px-3 py-2"
            >
              <option value="a4">A4, with a margin</option>
              <option value="match">Same size as each image</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={convert} disabled={runner.locked || adding}>
              Convert to PDF
            </Button>
            <p className="text-sm text-muted">{pluralize(images.length, 'image')}</p>
          </div>
        </section>
      )}

      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
