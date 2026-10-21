// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobsProvider } from '../../hooks/useJobs'

const getToolsStatus = vi.fn()

vi.mock('../../lib/bridge', () => ({
  bridge: {
    getToolsStatus: () => getToolsStatus(),
    onJobUpdated: () => () => undefined,
    listJobs: () => Promise.resolve([]),
    releaseFiles: () => Promise.resolve(),
    selectFiles: () => Promise.resolve([]),
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

const { ConvertPage } = await import('./ConvertPage')
const { CONVERSIONS } = await import('./conversions')

function renderPage() {
  return render(
    <JobsProvider>
      <ConvertPage />
    </JobsProvider>,
  )
}

describe('Convert page', () => {
  beforeEach(() => getToolsStatus.mockResolvedValue({ libreoffice: true }))
  afterEach(() => {
    cleanup()
    getToolsStatus.mockReset()
  })

  it('offers exactly the conversions in the registry, including PDF to Word', () => {
    renderPage()
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(CONVERSIONS.length)
    for (const conversion of CONVERSIONS) {
      expect(screen.getByRole('radio', { name: new RegExp(conversion.label, 'i') })).toBeTruthy()
    }
    expect(screen.getByRole('radio', { name: /PDF to Word/i })).toBeTruthy()
  })

  it('shows the limitation of the selected conversion', () => {
    renderPage()
    expect(screen.getByText(/can no longer be selected/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /PDF to text/i }))
    expect(screen.getByText(/need OCR/i)).toBeTruthy()
  })

  it('says the built-in converter is used when LibreOffice is missing, and still lets you choose a file', async () => {
    getToolsStatus.mockResolvedValue({ libreoffice: false })
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Word to PDF/i }))

    expect(await screen.findByText(/built-in converter \(basic layout\)/i)).toBeTruthy()
    const choose = screen.getByRole('button', { name: /choose a document/i }) as HTMLButtonElement
    expect(choose.disabled).toBe(false)
  })

  it('mentions LibreOffice for the closest layout when it is found', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /Word to PDF/i }))
    expect(await screen.findByText(/LibreOffice was found/i)).toBeTruthy()
  })

  it('explains PDF to Word limits honestly', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /PDF to Word/i }))
    expect(screen.getByText(/layout is rebuilt automatically/i)).toBeTruthy()
    expect(screen.getByText(/need OCR first/i)).toBeTruthy()
  })
})
