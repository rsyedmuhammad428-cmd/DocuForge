// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobsProvider } from '../../hooks/useJobs'

const getThumbnails = vi.fn()

vi.mock('../../lib/bridge', () => ({
  bridge: {
    getThumbnails: (...args: unknown[]) => getThumbnails(...args),
    onJobUpdated: () => () => undefined,
    listJobs: () => Promise.resolve([]),
    releaseFiles: () => Promise.resolve(),
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

const { Workspace } = await import('./OrganizePage')

/** jsdom has no IntersectionObserver. This stand-in reports every element as visible. */
class AlwaysVisibleObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    queueMicrotask(() =>
      this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never),
    )
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return []
  }
}

describe('Organize page previews', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', AlwaysVisibleObserver)
    getThumbnails.mockImplementation((_fileId: string, pages: number[]) =>
      Promise.resolve(
        pages.map((page) => ({
          page,
          width: 100,
          height: 140,
          dataUrl: `data:image/jpeg;base64,AAAA${page}`,
        })),
      ),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    getThumbnails.mockReset()
  })

  // React runs effects twice in development (StrictMode). Previews must survive that.
  it.each([
    ['normal mode', false],
    ['StrictMode (development)', true],
  ])('loads page previews in %s', async (_name, strict) => {
    const ui = (
      <JobsProvider>
        <Workspace file={{ id: 'file-1', name: 'doc.pdf', sizeBytes: 10 }} pageCount={3} />
      </JobsProvider>
    )
    render(strict ? <StrictMode>{ui}</StrictMode> : ui)

    const images = await screen.findAllByRole('img', undefined, { timeout: 2000 })
    expect(images).toHaveLength(3)
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(getThumbnails).toHaveBeenCalled()
  })
})
