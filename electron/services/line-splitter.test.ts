import { describe, expect, it, vi } from 'vitest'
import { createLineSplitter } from './line-splitter'

function collect() {
  const lines: string[] = []
  return { lines, splitter: createLineSplitter((line) => lines.push(line)) }
}

describe('createLineSplitter', () => {
  it('emits several lines from one chunk', () => {
    const { lines, splitter } = collect()
    splitter.push('one\ntwo\nthree\n')
    expect(lines).toEqual(['one', 'two', 'three'])
  })

  it('joins a line that arrives in pieces', () => {
    const { lines, splitter } = collect()
    splitter.push('{"type":"prog')
    expect(lines).toEqual([])
    splitter.push('ress"}\n')
    expect(lines).toEqual(['{"type":"progress"}'])
  })

  it('handles Windows line endings and blank lines', () => {
    const { lines, splitter } = collect()
    splitter.push('a\r\n\r\nb\r\n')
    expect(lines).toEqual(['a', 'b'])
  })

  it('flushes a last line that has no newline', () => {
    const { lines, splitter } = collect()
    splitter.push('last')
    splitter.flush()
    expect(lines).toEqual(['last'])
  })

  it('reports and drops a line that grows without end', () => {
    const onOverflow = vi.fn()
    const lines: string[] = []
    const splitter = createLineSplitter((line) => lines.push(line), onOverflow)
    splitter.push('x'.repeat(33 * 1024 * 1024))
    expect(onOverflow).toHaveBeenCalledOnce()
    splitter.push('ok\n')
    expect(lines).toEqual(['ok'])
  })
})
