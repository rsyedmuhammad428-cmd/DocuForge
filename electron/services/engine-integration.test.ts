import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OutputDataSchema, ThumbnailsDataSchema, ToolsStatusDataSchema } from '../../shared/engine-protocol'
import { resolveEngineCommand } from './engine-locator'
import { createEngineLauncher } from './engine-process'

/**
 * Runs the real Electron-side launcher against the real Python engine.
 * Skipped automatically when the engine environment has not been set up (npm run engine:setup).
 */
const command = resolveEngineCommand({
  isPackaged: false,
  appPath: process.cwd(),
  resourcesPath: '',
  platform: process.platform,
  env: process.env,
})
const engineReady = existsSync(command.command) || process.env['DOCUFORGE_PYTHON'] !== undefined

describe.skipIf(!engineReady)('engine integration (Node launcher + Python engine)', () => {
  let directory: string
  let first: string
  let second: string
  const launcher = createEngineLauncher({ resolveCommand: () => command, killGraceMs: 3000 })

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'docuforge-it-'))
    first = path.join(directory, 'first.pdf')
    second = path.join(directory, 'second.pdf')
    const script = `
import pymupdf, sys
for path, pages in ((sys.argv[1], 3), (sys.argv[2], 2)):
    with pymupdf.open() as doc:
        for n in range(pages):
            doc.new_page().insert_text((72, 72), f"{path[-10:]}-{n + 1}")
        doc.save(path)
`
    const made = spawnSync(command.command, ['-c', script, first, second], { encoding: 'utf8' })
    if (made.status !== 0) throw new Error(`Could not create test PDFs: ${made.stderr}`)
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('merges two PDFs and reports progress', async () => {
    const output = path.join(directory, 'merged.pdf')
    const progress: number[] = []
    const proc = launcher(
      { id: 'it-merge', op: 'merge', args: { inputs: [first, second], output } },
      (p) => progress.push(p.current),
    )
    const outcome = await proc.outcome

    expect(outcome.kind).toBe('result')
    if (outcome.kind !== 'result') return
    const data = OutputDataSchema.parse(outcome.data)
    expect(data.pageCount).toBe(5)
    expect(data.outputPaths).toEqual([output])
    expect(progress.length).toBeGreaterThan(0)
    expect(existsSync(output)).toBe(true)
  })

  it('returns thumbnails the app accepts', async () => {
    const proc = launcher(
      { id: 'it-thumbs', op: 'thumbnails', args: { input: first, pages: [0, 2], width: 120 } },
      () => undefined,
    )
    const outcome = await proc.outcome
    expect(outcome.kind).toBe('result')
    if (outcome.kind !== 'result') return
    expect(ThumbnailsDataSchema.parse(outcome.data).thumbnails).toHaveLength(2)
  })

  it('reports engine errors with a code and a readable message', async () => {
    const proc = launcher(
      {
        id: 'it-bad',
        op: 'merge',
        args: { inputs: [first, path.join(directory, 'nope.pdf')], output: path.join(directory, 'x.pdf') },
      },
      () => undefined,
    )
    expect(await proc.outcome).toMatchObject({ kind: 'error', code: 'INPUT_NOT_FOUND' })
    expect(await readdir(directory)).not.toContain('x.pdf')
  })

  it('cancels a running job and leaves no output or temp files', async () => {
    const outputDirectory = path.join(directory, 'split-out')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(outputDirectory)
    const bigScript = `
import pymupdf, sys
with pymupdf.open() as doc:
    for n in range(1500):
        doc.new_page().insert_text((72, 72), f"page {n}")
    doc.save(sys.argv[1])
`
    const big = path.join(directory, 'big.pdf')
    expect(spawnSync(command.command, ['-c', bigScript, big]).status).toBe(0)

    const proc = launcher(
      { id: 'it-cancel', op: 'split', args: { input: big, outputDir: outputDirectory, mode: 'each' } },
      () => undefined,
    )
    setTimeout(() => proc.cancel(), 150)
    const outcome = await proc.outcome

    // Either the job was stopped in time (nothing left behind) or it had already finished.
    if (outcome.kind === 'error') {
      expect(outcome.code).toBe('CANCELLED')
      expect(await readdir(outputDirectory)).toEqual([])
    } else {
      expect((await readdir(outputDirectory)).length).toBe(1500)
    }
  })

  it('compresses a PDF and reports the original size', async () => {
    const photoScript = `
import io, sys, pymupdf
from PIL import Image
noise = [Image.effect_noise((1800, 2400), 60) for _ in range(3)]
buffer = io.BytesIO(); Image.merge("RGB", noise).save(buffer, format="JPEG", quality=95)
with pymupdf.open() as doc:
    doc.new_page().insert_image(pymupdf.Rect(0, 100, 595, 842), stream=buffer.getvalue())
    doc.save(sys.argv[1])
`
    const photo = path.join(directory, 'photo.pdf')
    expect(spawnSync(command.command, ['-c', photoScript, photo]).status).toBe(0)
    const output = path.join(directory, 'photo_small.pdf')

    const outcome = await launcher(
      { id: 'it-compress', op: 'compress', args: { input: photo, output, preset: 'balanced' } },
      () => undefined,
    ).outcome

    expect(outcome.kind).toBe('result')
    if (outcome.kind !== 'result') return
    const data = OutputDataSchema.parse(outcome.data)
    expect(data.originalBytes).toBeGreaterThan(data.sizeBytes)
  })

  it('converts a PDF to text and text back to a PDF', async () => {
    const textFile = path.join(directory, 'first.txt')
    const roundTrip = path.join(directory, 'roundtrip.pdf')

    const extracted = await launcher(
      { id: 'it-text', op: 'pdf_to_text', args: { input: first, output: textFile, pageMarkers: true } },
      () => undefined,
    ).outcome
    expect(extracted.kind).toBe('result')

    const converted = await launcher(
      { id: 'it-topdf', op: 'text_to_pdf', args: { input: textFile, output: roundTrip } },
      () => undefined,
    ).outcome
    expect(converted.kind).toBe('result')
    expect(existsSync(roundTrip)).toBe(true)
  })

  it('reports which optional tools are installed', async () => {
    const outcome = await launcher({ id: 'it-tools', op: 'tools_status', args: {} }, () => undefined).outcome
    expect(outcome.kind).toBe('result')
    if (outcome.kind === 'result') expect(ToolsStatusDataSchema.parse(outcome.data)).toHaveProperty('libreoffice')
  })

  it('recognizes text in a scanned PDF with the real Tesseract', async () => {
    const tools = await launcher({ id: 'it-tools2', op: 'tools_status', args: {} }, () => undefined).outcome
    const status = tools.kind === 'result' ? ToolsStatusDataSchema.parse(tools.data) : undefined
    if (status === undefined || !status.tesseract.found || !status.tesseract.languages.includes('eng')) return // Tesseract not installed here

    const scanScript = `
import sys, pymupdf
with pymupdf.open() as src:
    page = src.new_page()
    page.insert_textbox(pymupdf.Rect(72, 72, 520, 400), "Invoice 2026-0412\\nTotal due: 1,250.00 USD", fontsize=16)
    pix = page.get_pixmap(dpi=200)
with pymupdf.open() as scan:
    p = scan.new_page(width=595, height=842)
    p.insert_image(p.rect, pixmap=pix)
    scan.save(sys.argv[1])
`
    const scan = path.join(directory, 'scan.pdf')
    expect(spawnSync(command.command, ['-c', scanScript, scan]).status).toBe(0)
    const output = path.join(directory, 'scan.txt')

    const outcome = await launcher(
      {
        id: 'it-ocr',
        op: 'ocr',
        args: { input: scan, output, format: 'text', languages: ['eng'], dpi: 300, useExistingText: true, pageMarkers: false },
      },
      () => undefined,
    ).outcome

    expect(outcome.kind).toBe('result')
    if (outcome.kind !== 'result') return
    const data = OutputDataSchema.parse(outcome.data)
    expect(data.preview).toContain('Invoice 2026-0412')
    expect(data.note).toContain('Recognized 1 page')
  })
})
