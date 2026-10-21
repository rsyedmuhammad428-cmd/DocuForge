import { describe, expect, it } from 'vitest'
import {
  createPages,
  deleteSelected,
  hasChanges,
  moveSelected,
  rotateSelected,
  selectedCount,
  setAllSelected,
  toExportPages,
  toggleSelected,
  type PageItem,
} from './page-model'

const order = (pages: readonly PageItem[]) => pages.map((page) => page.sourceIndex)

function select(pages: PageItem[], ...indexes: number[]): PageItem[] {
  return pages.map((page) => ({ ...page, selected: indexes.includes(page.sourceIndex) }))
}

describe('page model', () => {
  it('starts with every page in order, unselected and unrotated', () => {
    const pages = createPages(3)
    expect(order(pages)).toEqual([0, 1, 2])
    expect(selectedCount(pages)).toBe(0)
    expect(hasChanges(pages, 3)).toBe(false)
  })

  it('selects one page, all pages, or none', () => {
    let pages = toggleSelected(createPages(4), 2)
    expect(selectedCount(pages)).toBe(1)
    pages = toggleSelected(pages, 2)
    expect(selectedCount(pages)).toBe(0)
    expect(selectedCount(setAllSelected(pages, true))).toBe(4)
    expect(selectedCount(setAllSelected(setAllSelected(pages, true), false))).toBe(0)
  })

  it('rotates only selected pages and wraps around', () => {
    let pages = select(createPages(3), 1)
    pages = rotateSelected(pages, 90)
    expect(pages.map((p) => p.rotation)).toEqual([0, 90, 0])
    pages = rotateSelected(rotateSelected(pages, 270), 270)
    expect(pages[1]?.rotation).toBe(270)
    pages = rotateSelected(pages, 180)
    expect(pages[1]?.rotation).toBe(90)
  })

  it('deletes the selected pages', () => {
    const pages = deleteSelected(select(createPages(5), 1, 3))
    expect(order(pages)).toEqual([0, 2, 4])
  })

  it('moves a selected page earlier and later', () => {
    const pages = select(createPages(4), 2)
    expect(order(moveSelected(pages, -1))).toEqual([0, 2, 1, 3])
    expect(order(moveSelected(pages, 1))).toEqual([0, 1, 3, 2])
  })

  it('keeps a selected page at the edge where it is', () => {
    expect(order(moveSelected(select(createPages(3), 0), -1))).toEqual([0, 1, 2])
    expect(order(moveSelected(select(createPages(3), 2), 1))).toEqual([0, 1, 2])
  })

  it('moves a selected block together without scrambling it', () => {
    const pages = select(createPages(6), 2, 3)
    expect(order(moveSelected(pages, -1))).toEqual([0, 2, 3, 1, 4, 5])
    expect(order(moveSelected(pages, 1))).toEqual([0, 1, 4, 2, 3, 5])
  })

  it('moves separate selected pages independently', () => {
    const pages = select(createPages(5), 1, 3)
    expect(order(moveSelected(pages, -1))).toEqual([1, 0, 3, 2, 4])
  })

  it('does not move anything when everything is selected', () => {
    const pages = setAllSelected(createPages(3), true)
    expect(order(moveSelected(pages, -1))).toEqual([0, 1, 2])
    expect(order(moveSelected(pages, 1))).toEqual([0, 1, 2])
  })

  it('does not change the list it was given', () => {
    const pages = select(createPages(3), 1)
    moveSelected(pages, -1)
    rotateSelected(pages, 90)
    deleteSelected(pages)
    expect(order(pages)).toEqual([0, 1, 2])
    expect(pages.every((p) => p.rotation === 0)).toBe(true)
  })

  it('detects removed, reordered and rotated pages', () => {
    const pages = createPages(3)
    expect(hasChanges(deleteSelected(select(pages, 1)), 3)).toBe(true)
    expect(hasChanges(moveSelected(select(pages, 1), -1), 3)).toBe(true)
    expect(hasChanges(rotateSelected(select(pages, 0), 90), 3)).toBe(true)
  })

  it('exports all pages or only the selected ones, in the current order', () => {
    const pages = rotateSelected(moveSelected(select(createPages(4), 3), -1), 90)
    expect(toExportPages(pages, false)).toEqual([
      { index: 0, rotation: 0 },
      { index: 1, rotation: 0 },
      { index: 3, rotation: 90 },
      { index: 2, rotation: 0 },
    ])
    expect(toExportPages(pages, true)).toEqual([{ index: 3, rotation: 90 }])
  })
})
