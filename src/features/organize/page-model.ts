export type Rotation = 0 | 90 | 180 | 270

/** One page of the PDF being organized. `sourceIndex` is its zero-based position in the original file. */
export interface PageItem {
  sourceIndex: number
  /** Extra clockwise rotation applied on top of the page's own rotation. */
  rotation: Rotation
  selected: boolean
}

export interface ExportPage {
  index: number
  rotation: Rotation
}

export function createPages(count: number): PageItem[] {
  return Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex, rotation: 0, selected: false }))
}

function addRotation(current: Rotation, degrees: number): Rotation {
  return ((((current + degrees) % 360) + 360) % 360) as Rotation
}

export function toggleSelected(pages: readonly PageItem[], sourceIndex: number): PageItem[] {
  return pages.map((page) => (page.sourceIndex === sourceIndex ? { ...page, selected: !page.selected } : page))
}

export function setAllSelected(pages: readonly PageItem[], selected: boolean): PageItem[] {
  return pages.map((page) => (page.selected === selected ? page : { ...page, selected }))
}

export function selectedCount(pages: readonly PageItem[]): number {
  return pages.reduce((count, page) => count + (page.selected ? 1 : 0), 0)
}

/** Rotates the selected pages clockwise by 90, 180 or 270 degrees (270 is a quarter turn left). */
export function rotateSelected(pages: readonly PageItem[], degrees: 90 | 180 | 270): PageItem[] {
  return pages.map((page) =>
    page.selected ? { ...page, rotation: addRotation(page.rotation, degrees) } : page,
  )
}

export function deleteSelected(pages: readonly PageItem[]): PageItem[] {
  return pages.filter((page) => !page.selected)
}

/**
 * Moves every selected page one place earlier (-1) or later (+1), keeping their order.
 * A selected page that is already at the edge, or whose neighbour is also selected, stays put,
 * so a selected block moves as a block. One pass over the list: O(n).
 */
export function moveSelected(pages: readonly PageItem[], direction: -1 | 1): PageItem[] {
  const result = [...pages]
  const swap = (a: number, b: number): void => {
    const first = result[a]
    const second = result[b]
    if (first === undefined || second === undefined) return
    result[a] = second
    result[b] = first
  }

  if (direction === -1) {
    for (let i = 1; i < result.length; i += 1) {
      if (result[i]?.selected === true && result[i - 1]?.selected === false) swap(i, i - 1)
    }
  } else {
    for (let i = result.length - 2; i >= 0; i -= 1) {
      if (result[i]?.selected === true && result[i + 1]?.selected === false) swap(i, i + 1)
    }
  }
  return result
}

/** True if the pages differ from the original document: removed, reordered or rotated. */
export function hasChanges(pages: readonly PageItem[], originalCount: number): boolean {
  return (
    pages.length !== originalCount ||
    pages.some((page, position) => page.sourceIndex !== position || page.rotation !== 0)
  )
}

/** The page list to send to the engine, in the order it should appear in the new PDF. */
export function toExportPages(pages: readonly PageItem[], onlySelected: boolean): ExportPage[] {
  return pages
    .filter((page) => !onlySelected || page.selected)
    .map((page) => ({ index: page.sourceIndex, rotation: page.rotation }))
}
