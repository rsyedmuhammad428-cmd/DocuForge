// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobSnapshot } from '../../../shared/jobs'
import { JobsProvider } from '../../hooks/useJobs'

vi.mock('../../lib/bridge', () => ({
  bridge: {
    onJobUpdated: () => () => undefined,
    listJobs: () => Promise.resolve([]),
  },
  errorMessage: () => 'error',
}))

const { JobStatusPanel } = await import('./JobStatusPanel')

const finished = (result: Partial<NonNullable<JobSnapshot['result']>>): JobSnapshot => ({
  id: 'job',
  operation: 'compress',
  title: 'Compress report.pdf',
  status: 'succeeded',
  progress: null,
  createdAt: 0,
  finishedAt: 1,
  error: null,
  result: {
    fileCount: 1,
    firstFileName: 'report_compressed.pdf',
    location: 'C:\\Docs',
    totalBytes: 250 * 1024,
    pageCount: 4,
    originalBytes: null,
    note: null,
    preview: null,
    ...result,
  },
})

describe('JobStatusPanel', () => {
  afterEach(cleanup)
  const show = (job: JobSnapshot) =>
    render(
      <JobsProvider>
        <JobStatusPanel job={job} />
      </JobsProvider>,
    )

  it('shows how much smaller a compressed file is', () => {
    show(finished({ originalBytes: 1000 * 1024 }))
    expect(screen.getByText(/Reduced from 1000 KB to 250 KB/)).toBeTruthy()
    expect(screen.getByText(/75% smaller/)).toBeTruthy()
  })

  it('shows the recognized-text preview from OCR', () => {
    show(finished({ preview: 'Invoice 2026-0412\nTotal due: 1,250.00 USD' }))
    expect(screen.getByLabelText('Recognized text preview').textContent).toContain('Total due: 1,250.00 USD')
  })

  it('shows no reduction line for jobs that do not report an original size', () => {
    show(finished({}))
    expect(screen.queryByText(/Reduced from/)).toBeNull()
    expect(screen.getByText(/Saved report_compressed.pdf/)).toBeTruthy()
  })

  it('shows the engine\'s note about how the result was made', () => {
    show(finished({ note: 'The layout was rebuilt automatically.' }))
    expect(screen.getByText('The layout was rebuilt automatically.')).toBeTruthy()
  })

  it('shows a failure message such as "already compact"', () => {
    show({
      ...finished({}),
      status: 'failed',
      result: null,
      error: { code: 'NO_SIZE_GAIN', message: 'This PDF is already compact.' },
    })
    expect(screen.getByRole('alert').textContent).toContain('already compact')
  })
})
