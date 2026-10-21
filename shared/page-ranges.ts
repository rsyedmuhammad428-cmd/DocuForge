/**
 * Page numbering convention used everywhere in the app and in requests to the engine:
 * page numbers are ONE-based and ranges are INCLUSIVE ("2-4" means pages 2, 3 and 4).
 * Only the Organize page model uses zero-based source indexes internally; it converts at the edge.
 */

export interface PageRange {
  start: number
  end: number
}

export type ParseRangesResult = { ok: true; ranges: PageRange[] } | { ok: false; error: string }

const SINGLE = /^\d+$/
const SPAN = /^(\d+)\s*-\s*(\d+)$/
const OPEN_ENDED = /^(\d+)\s*-$/

/**
 * Parses text such as "1-3, 5, 8-" into ranges, checked against the document's page count.
 *
 * Rules: pages start at 1; "N-" means "from N to the last page"; ranges keep the order typed;
 * ranges may not overlap. Complexity is O(k log k) for k ranges, independent of page count.
 */
export function parsePageRanges(text: string, pageCount: number): ParseRangesResult {
  if (text.trim() === '') {
    return { ok: false, error: 'Enter at least one page or page range, for example 1-3, 5.' }
  }

  const ranges: PageRange[] = []
  for (const rawToken of text.split(',')) {
    const token = rawToken.trim()
    if (token === '') {
      return { ok: false, error: 'There is an empty entry. Remove the extra comma.' }
    }

    let start: number
    let end: number
    const span = SPAN.exec(token)
    const open = OPEN_ENDED.exec(token)
    if (SINGLE.test(token)) {
      start = end = Number(token)
    } else if (span?.[1] !== undefined && span[2] !== undefined) {
      start = Number(span[1])
      end = Number(span[2])
    } else if (open?.[1] !== undefined) {
      start = Number(open[1])
      end = pageCount
    } else {
      return { ok: false, error: `"${token}" is not a page number or range.` }
    }

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return { ok: false, error: `"${token}" is too large.` }
    }
    if (start < 1) {
      return { ok: false, error: 'Page numbers start at 1.' }
    }
    if (start > pageCount || end > pageCount) {
      return {
        ok: false,
        error: `The document has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}. "${token}" goes past the end.`,
      }
    }
    if (end < start) {
      return { ok: false, error: `"${token}" runs backwards. Write the smaller page first.` }
    }
    ranges.push({ start, end })
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (previous !== undefined && current !== undefined && current.start <= previous.end) {
      return { ok: false, error: 'Page ranges overlap. Each page can be used only once.' }
    }
  }

  return { ok: true, ranges }
}

export function countPages(ranges: readonly PageRange[]): number {
  return ranges.reduce((total, range) => total + (range.end - range.start + 1), 0)
}

export type OptionalRangesResult =
  | { ok: true; ranges: PageRange[] | undefined }
  | { ok: false; error: string }

/** Like parsePageRanges, but empty input means "every page" (ranges is undefined). */
export function parseOptionalPageRanges(text: string, pageCount: number): OptionalRangesResult {
  return text.trim() === '' ? { ok: true, ranges: undefined } : parsePageRanges(text, pageCount)
}
