// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntryView } from '../../../shared/history'
import { JobsProvider } from '../../hooks/useJobs'
import { SettingsProvider } from '../../hooks/useSettings'

const bridge = {
  listHistory: vi.fn(),
  openHistoryEntry: vi.fn(),
  revealHistoryEntry: vi.fn(),
  clearHistory: vi.fn(),
  getSettings: vi.fn(),
  onJobUpdated: () => () => undefined,
  listJobs: () => Promise.resolve([]),
}
vi.mock('../../lib/bridge', () => ({
  bridge: new Proxy({}, { get: (_t, key: string) => (bridge as Record<string, unknown>)[key] }),
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

const { RecentPage } = await import('./RecentPage')

const entry = (id: string, extra: Partial<HistoryEntryView> = {}): HistoryEntryView => ({
  id,
  operation: 'merge',
  title: `Job ${id}`,
  status: 'succeeded',
  finishedAt: Date.UTC(2026, 9, 18, 12, 0, 0),
  inputNames: ['a.pdf'],
  outputName: `${id}.pdf`,
  outputLocation: 'C:\\Docs',
  outputCount: 1,
  totalBytes: 2048,
  errorMessage: null,
  available: true,
  ...extra,
})

const renderPage = () =>
  render(
    <SettingsProvider>
      <JobsProvider>
        <RecentPage />
      </JobsProvider>
    </SettingsProvider>,
  )

describe('Recent Files page', () => {
  beforeEach(() => {
    bridge.getSettings.mockResolvedValue({ theme: 'system', defaultOutputFolder: null, saveHistory: true, cleanupTempFiles: true })
    bridge.openHistoryEntry.mockResolvedValue(undefined)
    bridge.revealHistoryEntry.mockResolvedValue(undefined)
    bridge.clearHistory.mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    for (const fn of Object.values(bridge)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset()
  })

  it('shows an empty state', async () => {
    bridge.listHistory.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/Nothing here yet/i)).toBeTruthy()
  })

  it('lets you open a result that still exists', async () => {
    bridge.listHistory.mockResolvedValue([entry('one')])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /open file/i }))
    await waitFor(() => expect(bridge.openHistoryEntry).toHaveBeenCalledWith('one'))
    fireEvent.click(screen.getByRole('button', { name: /show in folder/i }))
    await waitFor(() => expect(bridge.revealHistoryEntry).toHaveBeenCalledWith('one'))
  })

  it('says so, and offers no buttons, when the file has been moved or deleted', async () => {
    bridge.listHistory.mockResolvedValue([entry('gone', { available: false })])
    renderPage()
    expect(await screen.findByText(/no longer there/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open file/i })).toBeNull()
  })

  it('shows failures and cancellations without file buttons', async () => {
    bridge.listHistory.mockResolvedValue([
      entry('bad', { status: 'failed', outputName: null, outputLocation: null, errorMessage: 'This PDF is password protected.', available: false }),
      entry('stopped', { status: 'cancelled', outputName: null, available: false }),
    ])
    renderPage()
    expect(await screen.findByText(/password protected/i)).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open file/i })).toBeNull()
  })

  it('says "Open folder" when a job made several files', async () => {
    bridge.listHistory.mockResolvedValue([entry('split', { outputCount: 5 })])
    renderPage()
    expect(await screen.findByRole('button', { name: /open folder/i })).toBeTruthy()
    expect(screen.getByText(/5 files/)).toBeTruthy()
  })

  it('asks before clearing, and clears only when confirmed', async () => {
    bridge.listHistory.mockResolvedValue([entry('one')])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /clear history/i }))
    expect(bridge.clearHistory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(bridge.clearHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, clear it/i }))
    await waitFor(() => expect(bridge.clearHistory).toHaveBeenCalledOnce())
  })

  it('tells you when history is turned off', async () => {
    bridge.getSettings.mockResolvedValue({ theme: 'system', defaultOutputFolder: null, saveHistory: false, cleanupTempFiles: true })
    bridge.listHistory.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/History is turned off/i)).toBeTruthy()
  })
})
