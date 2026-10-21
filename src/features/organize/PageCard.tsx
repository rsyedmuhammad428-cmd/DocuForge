import { memo, useEffect } from 'react'
import { useInView } from '../../hooks/useInView'
import type { PageItem, Rotation } from './page-model'

// Full class names so Tailwind can see them. 90/270 are scaled down so a turned page still fits.
const ROTATION_CLASS: Record<Rotation, string> = {
  0: '',
  90: 'rotate-90 scale-75',
  180: 'rotate-180',
  270: '-rotate-90 scale-75',
}

interface PageCardProps {
  item: PageItem
  /** One-based position in the new document. */
  position: number
  thumbnail: string | undefined
  onToggle: (sourceIndex: number) => void
  /** Called when the card is on screen and has no preview yet. */
  onNeedThumbnail: (sourceIndex: number) => void
}

export const PageCard = memo(function PageCard({
  item,
  position,
  thumbnail,
  onToggle,
  onNeedThumbnail,
}: PageCardProps) {
  const { ref, inView } = useInView<HTMLLabelElement>()

  useEffect(() => {
    if (inView && thumbnail === undefined) onNeedThumbnail(item.sourceIndex)
  }, [inView, thumbnail, item.sourceIndex, onNeedThumbnail])

  const originalNumber = item.sourceIndex + 1

  return (
    <label
      ref={ref}
      className="flex cursor-pointer flex-col gap-2 rounded-card border border-border bg-surface p-2 hover:bg-surface-hover has-checked:border-accent has-checked:bg-subtle has-focus-visible:outline-2 has-focus-visible:outline-accent"
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={item.selected}
        onChange={() => onToggle(item.sourceIndex)}
      />
      <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-control bg-app">
        {thumbnail === undefined ? (
          <span className="text-sm text-muted">Loading…</span>
        ) : (
          <img
            src={thumbnail}
            alt={`Preview of original page ${originalNumber}`}
            draggable={false}
            className={`max-h-full max-w-full object-contain transition-transform ${ROTATION_CLASS[item.rotation]}`}
          />
        )}
      </div>
      <div className="text-center text-sm">
        <p className="font-medium">
          Page {position}
          {item.selected && <span className="sr-only"> (selected)</span>}
        </p>
        {(originalNumber !== position || item.rotation !== 0) && (
          <p className="text-xs text-muted">
            {originalNumber !== position && `Was page ${originalNumber}`}
            {originalNumber !== position && item.rotation !== 0 && ' · '}
            {item.rotation !== 0 && `Turned ${item.rotation}°`}
          </p>
        )}
      </div>
    </label>
  )
})
