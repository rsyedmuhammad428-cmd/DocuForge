// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../../hooks/useSettings'

const bridge = {
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getAppInfo: vi.fn(),
  getToolsStatus: vi.fn(),
  clearHistory: vi.fn(),
}
vi.mock('../../lib/bridge', () => ({
  bridge: new Proxy({}, { get: (_t, key: string) => (bridge as Record<string, unknown>)[key] }),
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

const { SettingsPage } = await import('./SettingsPage')
const base = { theme: 'system', defaultOutputFolder: null, saveHistory: true, cleanupTempFiles: true }

const renderPage = () =>
  render(
    <SettingsProvider>
      <SettingsPage />
    </SettingsProvider>,
  )

describe('Settings page', () => {
  beforeEach(() => {
    bridge.getSettings.mockResolvedValue(base)
    bridge.updateSettings.mockImplementation((patch: object) => Promise.resolve({ ...base, ...patch }))
    bridge.getAppInfo.mockResolvedValue({ name: 'DocuForge', version: '0.4.0', electronVersion: '44' })
    bridge.getToolsStatus.mockResolvedValue({ libreoffice: false, tesseract: { found: true, languages: ['eng', 'urd'] } })
    bridge.clearHistory.mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    for (const fn of Object.values(bridge)) fn.mockReset()
  })

  it('shows which optional programs were found', async () => {
    renderPage()
    expect(await screen.findByText(/Languages: English \(eng\), Urdu \(urd\)/)).toBeTruthy()
    expect(screen.getByText(/Word to PDF still works for \.docx/)).toBeTruthy()
  })

  it('says Tesseract is missing when it is', async () => {
    bridge.getToolsStatus.mockResolvedValue({ libreoffice: true, tesseract: { found: false, languages: [] } })
    renderPage()
    expect(await screen.findByText(/Needed to read scanned documents/)).toBeTruthy()
    expect(screen.getByText(/Used for the closest Word to PDF layout/)).toBeTruthy()
  })

  it('saves the history and cleanup switches', async () => {
    renderPage()
    const history = (await screen.findByRole('checkbox', { name: /Keep a history/ })) as HTMLInputElement
    await waitFor(() => expect(history.disabled).toBe(false))
    fireEvent.click(history)
    await waitFor(() => expect(bridge.updateSettings).toHaveBeenCalledWith({ saveHistory: false }))
    await waitFor(() => expect(history.checked).toBe(false))

    fireEvent.click(screen.getByRole('checkbox', { name: /Clean up leftover temporary files/ }))
    await waitFor(() => expect(bridge.updateSettings).toHaveBeenCalledWith({ cleanupTempFiles: false }))
  })

  it('clears history only after confirmation', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /clear history/i }))
    expect(bridge.clearHistory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /yes, clear it/i }))
    await waitFor(() => expect(bridge.clearHistory).toHaveBeenCalledOnce())
    expect(await screen.findByText(/History was cleared/)).toBeTruthy()
  })
})
