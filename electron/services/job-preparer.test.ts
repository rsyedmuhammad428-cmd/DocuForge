import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { JobRequest } from '../../shared/jobs'
import { FileRegistry } from './file-registry'
import { JobRequestError, prepareJob } from './job-preparer'

function setup() {
  const registry = new FileRegistry()
  const a = registry.addInput(path.resolve('docs', 'a.pdf'), 1)
  const b = registry.addInput(path.resolve('docs', 'b.pdf'), 1)
  const saveFile = registry.addOutput('file', path.resolve('out', 'merged.pdf'))
  const saveFolder = registry.addOutput('folder', path.resolve('out'))
  return { registry, a, b, saveFile, saveFolder }
}

describe('prepareJob', () => {
  it('turns a merge request into paths for the engine', () => {
    const { registry, a, b, saveFile } = setup()
    const job = prepareJob(
      { operation: 'merge', inputIds: [b.id, a.id], outputId: saveFile.id },
      registry,
    )
    expect(job.title).toBe('Merge 2 PDFs')
    expect(job.engine).toEqual({
      op: 'merge',
      args: {
        inputs: [path.resolve('docs', 'b.pdf'), path.resolve('docs', 'a.pdf')],
        output: path.resolve('out', 'merged.pdf'),
      },
    })
    expect(job.outputDirectory).toBe(path.resolve('out'))
  })

  it('rejects ids that no dialog issued', () => {
    const { registry, a, saveFile } = setup()
    expect(() =>
      prepareJob({ operation: 'merge', inputIds: [a.id, 'forged'], outputId: saveFile.id }, registry),
    ).toThrow(JobRequestError)
    expect(() =>
      prepareJob({ operation: 'merge', inputIds: [a.id, a.id], outputId: 'forged' }, registry),
    ).toThrow(JobRequestError)
  })

  it('rejects a folder where a file is needed, and the reverse', () => {
    const { registry, a, b, saveFolder, saveFile } = setup()
    expect(() =>
      prepareJob({ operation: 'merge', inputIds: [a.id, b.id], outputId: saveFolder.id }, registry),
    ).toThrow(JobRequestError)
    expect(() =>
      prepareJob(
        { operation: 'split', inputId: a.id, outputId: saveFile.id, mode: 'each' },
        registry,
      ),
    ).toThrow(JobRequestError)
  })

  it('refuses to overwrite an input', () => {
    const { registry, a, b } = setup()
    const overInput = registry.addOutput('file', path.resolve('docs', 'a.pdf'))
    expect(() =>
      prepareJob({ operation: 'merge', inputIds: [a.id, b.id], outputId: overInput.id }, registry),
    ).toThrow(/cannot replace/)
    expect(() =>
      prepareJob(
        { operation: 'organize', inputId: a.id, outputId: overInput.id, pages: [{ index: 0, rotation: 0 }] },
        registry,
      ),
    ).toThrow(/different name/)
  })

  it('builds split requests with one-based ranges for the engine', () => {
    const { registry, a, saveFolder } = setup()
    const request: JobRequest = {
      operation: 'split',
      inputId: a.id,
      outputId: saveFolder.id,
      mode: 'ranges',
      ranges: [{ start: 2, end: 4 }],
    }
    const job = prepareJob(request, registry)
    expect(job.engine.op).toBe('split')
    expect(job.engine.args).toMatchObject({ baseName: 'a', mode: 'ranges', ranges: [[2, 4]] })
  })

  it('passes organize pages through unchanged', () => {
    const { registry, a, saveFile } = setup()
    const pages = [{ index: 2, rotation: 90 as const }, { index: 0, rotation: 0 as const }]
    const job = prepareJob(
      { operation: 'organize', inputId: a.id, outputId: saveFile.id, pages },
      registry,
    )
    expect(job.engine).toEqual({
      op: 'organize_export',
      args: { input: path.resolve('docs', 'a.pdf'), output: path.resolve('out', 'merged.pdf'), pages },
    })
  })

  describe('conversion and compression', () => {
    it('builds an images-to-PDF job in the chosen order', () => {
      const { registry, a, b, saveFile } = setup()
      const job = prepareJob(
        { operation: 'images_to_pdf', inputIds: [b.id, a.id], outputId: saveFile.id, pageSize: 'match' },
        registry,
      )
      expect(job.title).toBe('Convert 2 images to PDF')
      expect(job.engine).toEqual({
        op: 'images_to_pdf',
        args: {
          inputs: [path.resolve('docs', 'b.pdf'), path.resolve('docs', 'a.pdf')],
          output: path.resolve('out', 'merged.pdf'),
          pageSize: 'match',
        },
      })
    })

    it('builds a PDF-to-images job that writes into a folder', () => {
      const { registry, a, saveFolder, saveFile } = setup()
      const request: Extract<JobRequest, { operation: 'pdf_to_images' }> = {
        operation: 'pdf_to_images',
        inputId: a.id,
        outputId: saveFolder.id,
        format: 'jpeg',
        dpi: 150,
        ranges: [{ start: 2, end: 3 }],
      }
      const job = prepareJob(request, registry)
      expect(job.engine.args).toMatchObject({ baseName: 'a', format: 'jpeg', dpi: 150, ranges: [[2, 3]] })
      expect(job.outputDirectory).toBe(path.resolve('out'))
      expect(() => prepareJob({ ...request, outputId: saveFile.id }, registry)).toThrow(JobRequestError)
    })

    it('builds PDF-to-text, text-to-PDF, document-to-PDF and compress jobs', () => {
      const { registry, a, saveFile } = setup()
      const common = { inputId: a.id, outputId: saveFile.id }
      expect(
        prepareJob({ operation: 'pdf_to_text', ...common, pageMarkers: false }, registry).engine,
      ).toMatchObject({ op: 'pdf_to_text', args: { pageMarkers: false } })
      expect(prepareJob({ operation: 'text_to_pdf', ...common }, registry).engine.op).toBe('text_to_pdf')
      const toWord = prepareJob({ operation: 'pdf_to_docx', ...common, ranges: [{ start: 1, end: 2 }] }, registry)
      expect(toWord.title).toBe('Convert a.pdf to Word')
      expect(toWord.engine).toMatchObject({ op: 'pdf_to_docx', args: { ranges: [[1, 2]] } })
      expect(prepareJob({ operation: 'document_to_pdf', ...common }, registry).engine.op).toBe('document_to_pdf')
      const compress = prepareJob({ operation: 'compress', ...common, preset: 'balanced' }, registry)
      expect(compress.title).toBe('Compress a.pdf')
      expect(compress.engine).toMatchObject({ op: 'compress', args: { preset: 'balanced' } })
    })

    it('builds an OCR job and records the input names for history', () => {
      const { registry, a, saveFile } = setup()
      const job = prepareJob(
        {
          operation: 'ocr',
          inputId: a.id,
          outputId: saveFile.id,
          format: 'pdf',
          languages: ['eng', 'urd'],
          dpi: 300,
          useExistingText: true,
          pageMarkers: false,
          ranges: [{ start: 1, end: 2 }],
        },
        registry,
      )
      expect(job.title).toBe('Recognize text in a.pdf')
      expect(job.inputNames).toEqual(['a.pdf'])
      expect(job.engine).toMatchObject({
        op: 'ocr',
        args: { format: 'pdf', languages: ['eng', 'urd'], dpi: 300, ranges: [[1, 2]] },
      })
    })

    it('lists every input name, in order, for a merge', () => {
      const { registry, a, b, saveFile } = setup()
      const job = prepareJob({ operation: 'merge', inputIds: [b.id, a.id], outputId: saveFile.id }, registry)
      expect(job.inputNames).toEqual(['b.pdf', 'a.pdf'])
    })

    it('refuses to overwrite the original in every conversion', () => {
      const { registry, a } = setup()
      const overInput = registry.addOutput('file', path.resolve('docs', 'a.pdf'))
      const common = { inputId: a.id, outputId: overInput.id }
      const requests: JobRequest[] = [
        { operation: 'compress', ...common, preset: 'light' },
        { operation: 'pdf_to_text', ...common, pageMarkers: true },
        { operation: 'text_to_pdf', ...common },
        { operation: 'document_to_pdf', ...common },
        { operation: 'pdf_to_docx', ...common },
        { operation: 'ocr', ...common, format: 'text', languages: ['eng'], dpi: 300, useExistingText: true, pageMarkers: true },
        { operation: 'images_to_pdf', inputIds: [a.id], outputId: overInput.id, pageSize: 'a4' },
      ]
      for (const request of requests) {
        expect(() => prepareJob(request, registry)).toThrow(JobRequestError)
      }
    })
  })
})
