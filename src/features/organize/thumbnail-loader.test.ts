import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageThumbnail } from '../../../shared/files'
import { ThumbnailLoader } from './thumbnail-loader'

const thumb = (page: number): PageThumbnail => ({
  page,
  width: 100,
  height: 140,
  dataUrl: `data:image/jpeg;base64,${page}`,
})

function setup(options: { maxCached?: number; batchSize?: number; failWith?: Error } = {}) {
  const calls: number[][] = []
  let failWith = options.failWith
  const onChange = vi.fn()
  const loader = new ThumbnailLoader({
    fetchBatch: async (pages) => {
      calls.push(pages)
      if (failWith !== undefined) throw failWith
      return pages.map(thumb)
    },
    onChange,
    maxCached: options.maxCached,
    batchSize: options.batchSize,
    delayMs: 10,
  })
  return { loader, calls, onChange, stopFailing: () => (failWith = undefined) }
}

describe('ThumbnailLoader', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends requests made close together as one sorted batch', async () => {
    const { loader, calls } = setup()
    loader.request(5)
    loader.request(1)
    loader.request(3)
    await vi.advanceTimersByTimeAsync(20)
    expect(calls).toEqual([[1, 3, 5]])
    expect(loader.get(3)).toBe('data:image/jpeg;base64,3')
  })

  it('does not request a page twice', async () => {
    const { loader, calls } = setup()
    loader.request(1)
    loader.request(1)
    await vi.advanceTimersByTimeAsync(20)
    loader.request(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(calls).toEqual([[1]])
  })

  it('works through a long queue one batch at a time', async () => {
    const { loader, calls } = setup({ batchSize: 2 })
    for (const page of [0, 1, 2, 3, 4]) loader.request(page)
    await vi.advanceTimersByTimeAsync(200)
    expect(calls).toEqual([[0, 1], [2, 3], [4]])
  })

  it('keeps only a limited number of previews, dropping the oldest', async () => {
    const { loader } = setup({ maxCached: 2, batchSize: 1 })
    for (const page of [0, 1, 2]) loader.request(page)
    await vi.advanceTimersByTimeAsync(200)
    expect(loader.get(0)).toBeUndefined()
    expect(loader.get(1)).toBeDefined()
    expect(loader.get(2)).toBeDefined()
  })

  it('loads an evicted page again when it is requested again', async () => {
    const { loader, calls } = setup({ maxCached: 1, batchSize: 1 })
    loader.request(0)
    loader.request(1)
    await vi.advanceTimersByTimeAsync(100)
    loader.request(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls.flat()).toEqual([0, 1, 0])
  })

  it('stops after an error, reports it, and recovers on retry', async () => {
    const { loader, calls, stopFailing, onChange } = setup({ failWith: new Error('Engine down') })
    loader.request(4)
    await vi.advanceTimersByTimeAsync(20)
    expect(loader.error).toBe('Engine down')
    expect(onChange).toHaveBeenCalled()

    loader.request(5) // ignored while failed
    await vi.advanceTimersByTimeAsync(20)
    expect(calls).toEqual([[4]])

    stopFailing()
    loader.retry()
    await vi.advanceTimersByTimeAsync(20)
    expect(loader.error).toBeNull()
    expect(loader.get(4)).toBeDefined()
  })

  it('works again after being disposed and restarted (React StrictMode runs cleanup then setup)', async () => {
    const { loader, calls } = setup()
    loader.dispose()
    loader.start()
    loader.request(2)
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toEqual([[2]])
    expect(loader.get(2)).toBeDefined()
  })

  it('ignores everything after it is disposed', async () => {
    const { loader, calls, onChange } = setup()
    loader.request(1)
    loader.dispose()
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
    loader.request(2)
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toEqual([])
  })
})
