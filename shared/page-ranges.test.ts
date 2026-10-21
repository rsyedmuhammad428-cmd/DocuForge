import { describe, expect, it } from 'vitest'
import { countPages, parseOptionalPageRanges, parsePageRanges } from './page-ranges'

const ok = (text: string, pages = 10) => {
  const result = parsePageRanges(text, pages)
  if (!result.ok) throw new Error(result.error)
  return result.ranges
}
const error = (text: string, pages = 10) => {
  const result = parsePageRanges(text, pages)
  return result.ok ? null : result.error
}

describe('parsePageRanges', () => {
  it('parses single pages, spans and open-ended ranges', () => {
    expect(ok('3')).toEqual([{ start: 3, end: 3 }])
    expect(ok('2-4')).toEqual([{ start: 2, end: 4 }])
    expect(ok('8-')).toEqual([{ start: 8, end: 10 }])
    expect(ok(' 1 - 3 , 5 ,8- ')).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
      { start: 8, end: 10 },
    ])
  })

  it('keeps the order that was typed', () => {
    expect(ok('7, 1-2')).toEqual([
      { start: 7, end: 7 },
      { start: 1, end: 2 },
    ])
  })

  it('accepts the first and last page', () => {
    expect(ok('1')).toHaveLength(1)
    expect(ok('10')).toHaveLength(1)
    expect(ok('1-10')).toHaveLength(1)
  })

  it.each(['', '   '])('rejects empty input %j', (text) => {
    expect(error(text)).toMatch(/at least one page/i)
  })

  it('rejects empty entries', () => {
    expect(error('1,,2')).toMatch(/empty entry/i)
    expect(error('1,')).toMatch(/empty entry/i)
  })

  it('rejects text that is not a page or range', () => {
    for (const text of ['a', '1-b', '1--3', '-3', '1.5', '1 2']) {
      expect(error(text)).toMatch(/not a page number or range/i)
    }
  })

  it('rejects page 0 and pages past the end', () => {
    expect(error('0')).toMatch(/start at 1/i)
    expect(error('0-3')).toMatch(/start at 1/i)
    expect(error('11')).toMatch(/goes past the end/i)
    expect(error('5-11')).toMatch(/goes past the end/i)
    expect(error('2', 1)).toMatch(/1 page\./i)
  })

  it('rejects ranges that run backwards', () => {
    expect(error('5-3')).toMatch(/backwards/i)
  })

  it('rejects overlapping ranges, in any order', () => {
    expect(error('1-5, 5-8')).toMatch(/overlap/i)
    expect(error('3, 3')).toMatch(/overlap/i)
    expect(error('6-9, 1-2, 8')).toMatch(/overlap/i)
  })

  it('allows ranges that touch without overlapping', () => {
    expect(ok('1-4, 5-8')).toHaveLength(2)
  })

  it('rejects numbers that are too large to be exact', () => {
    expect(error('99999999999999999999')).toMatch(/too large/i)
  })
})

describe('countPages', () => {
  it('adds up the pages in every range', () => {
    expect(countPages([{ start: 1, end: 3 }, { start: 7, end: 7 }])).toBe(4)
    expect(countPages([])).toBe(0)
  })
})

describe('parseOptionalPageRanges', () => {
  it('treats empty input as every page', () => {
    expect(parseOptionalPageRanges('  ', 10)).toEqual({ ok: true, ranges: undefined })
  })

  it('otherwise behaves like parsePageRanges', () => {
    expect(parseOptionalPageRanges('2-3', 10)).toEqual({ ok: true, ranges: [{ start: 2, end: 3 }] })
    expect(parseOptionalPageRanges('11', 10).ok).toBe(false)
  })
})
