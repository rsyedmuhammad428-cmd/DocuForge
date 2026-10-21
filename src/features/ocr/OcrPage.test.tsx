// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobsProvider } from '../../hooks/useJobs'

const bridge = {
  getToolsStatus: vi.fn(),
  selectFiles: vi.fn(),
  inspectPdfs: vi.fn(),
  selectOutputFile: vi.fn(),
  startJob: vi.fn(),
  onJobUpdated: () => () => undefined,
  listJobs: () => Promise.resolve([]),
  releaseFiles: () => Promise.resolve(),
}
vi.mock('../../lib/bridge', () => ({
  bridge: new Proxy({}, { get: (_t, key: string) => (bridge as Record<string, unknown>)[key] }),
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error'),
}))

const { OcrPage } = await import('./OcrPage')

const tools = (tesseract: { found: boolean; languages: string[] }) => ({ libreoffice: false, tesseract })
const renderPage = () =>
  render(
    <JobsProvider>
      <OcrPage />
    </JobsProvider>,
  )

describe('OCR page', () => {
  beforeEach(() => {
    bridge.getToolsStatus.mockResolvedValue(tools({ found: true, languages: ['eng', 'urd'] }))
    bridge.selectFiles.mockResolvedValue([{ id: 'f1', name: 'scan.pdf', sizeBytes: 2048 }])
    bridge.inspectPdfs.mockResolvedValue([{ fileId: 'f1', ok: true, pageCount: 3, error: null }])
    bridge.selectOutputFile.mockResolvedValue({ id: 'o1', name: 'scan_text.txt', location: 'C:\\Docs' })
    bridge.startJob.mockResolvedValue('job-1')
  })
  afterEach(() => {
    cleanup()
    for (const fn of [bridge.getToolsStatus, bridge.selectFiles, bridge.inspectPdfs, bridge.selectOutputFile, bridge.startJob]) fn.mockReset()
  })

  it('explains a missing Tesseract and offers no way to run OCR', async () => {
    bridge.getToolsStatus.mockResolvedValue(tools({ found: false, languages: [] }))
    renderPage()
    expect(await screen.findByText(/Tesseract OCR was not found/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /check again/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /recognize text/i })).toBeNull()
  })

  it('offers the installed languages with English chosen by default', async () => {
    renderPage()
    const english = (await screen.findByRole('checkbox', { name: /English \(eng\)/ })) as HTMLInputElement
    const urdu = screen.getByRole('checkbox', { name: /Urdu \(urd\)/ }) as HTMLInputElement
    expect(english.checked).toBe(true)
    expect(urdu.checked).toBe(false)
    fireEvent.click(urdu)
    expect(urdu.checked).toBe(true)
  })

  it('starts a text OCR job with the chosen options', async () => {
    renderPage()
    await screen.findByRole('checkbox', { name: /English/ })
    const run = screen.getByRole('button', { name: /recognize text/i }) as HTMLButtonElement
    expect(run.disabled).toBe(true) // no file yet

    fireEvent.click(screen.getByRole('button', { name: /choose a scanned pdf/i }))
    await waitFor(() => expect(run.disabled).toBe(false))
    fireEvent.click(screen.getByRole('checkbox', { name: /Urdu/ }))
    fireEvent.click(run)

    await waitFor(() => expect(bridge.startJob).toHaveBeenCalled())
    expect(bridge.selectOutputFile).toHaveBeenCalledWith('scan_text.txt', 'text')
    expect(bridge.startJob).toHaveBeenCalledWith({
      operation: 'ocr',
      inputId: 'f1',
      outputId: 'o1',
      format: 'text',
      languages: ['eng', 'urd'],
      dpi: 300,
      useExistingText: true,
      pageMarkers: true,
      ranges: undefined,
    })
  })

  it('asks for a PDF save location when a searchable PDF is chosen', async () => {
    renderPage()
    await screen.findByRole('checkbox', { name: /English/ })
    fireEvent.click(screen.getByRole('button', { name: /choose a scanned pdf/i }))
    fireEvent.click(screen.getByRole('radio', { name: /Searchable PDF/i }))
    const run = screen.getByRole('button', { name: /recognize text/i }) as HTMLButtonElement
    await waitFor(() => expect(run.disabled).toBe(false))
    fireEvent.click(run)

    await waitFor(() => expect(bridge.selectOutputFile).toHaveBeenCalledWith('scan_searchable.pdf', 'pdf'))
    await waitFor(() => expect(bridge.startJob).toHaveBeenCalled())
    expect(bridge.startJob.mock.calls[0]?.[0]).toMatchObject({ format: 'pdf', pageMarkers: false })
  })

  it('blocks a page range that is outside the document', async () => {
    renderPage()
    await screen.findByRole('checkbox', { name: /English/ })
    fireEvent.click(screen.getByRole('button', { name: /choose a scanned pdf/i }))
    const pages = await screen.findByLabelText(/pages \(optional\)/i)
    fireEvent.change(pages, { target: { value: '9' } })
    expect(screen.getByRole('alert').textContent).toMatch(/goes past the end/i)
    expect((screen.getByRole('button', { name: /recognize text/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('starts an image job without asking for pages or existing text', async () => {
    bridge.selectFiles.mockResolvedValue([{ id: 'img', name: 'receipt.png', sizeBytes: 500 }])
    renderPage()
    await screen.findByRole('checkbox', { name: /English/ })
    fireEvent.click(screen.getByRole('radio', { name: /An image/i }))
    expect(screen.queryByLabelText(/pages \(optional\)/i)).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /choose an image/i }))
    const run = screen.getByRole('button', { name: /recognize text/i }) as HTMLButtonElement
    await waitFor(() => expect(run.disabled).toBe(false))
    fireEvent.click(run)
    await waitFor(() => expect(bridge.startJob).toHaveBeenCalled())
    expect(bridge.startJob.mock.calls[0]?.[0]).toMatchObject({ inputId: 'img', useExistingText: false })
    expect(bridge.inspectPdfs).not.toHaveBeenCalled()
  })
})
