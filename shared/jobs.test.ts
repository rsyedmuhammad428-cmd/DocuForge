import { describe, expect, it } from 'vitest'
import { JobRequestSchema } from './jobs'

const base = { inputId: 'a', outputId: 'b' }
const valid = (value: unknown) => JobRequestSchema.safeParse(value).success

describe('JobRequestSchema', () => {
  it('accepts a well-formed request of every operation', () => {
    expect(valid({ operation: 'merge', inputIds: ['a', 'b'], outputId: 'o' })).toBe(true)
    expect(valid({ operation: 'split', ...base, mode: 'each' })).toBe(true)
    expect(valid({ operation: 'organize', ...base, pages: [{ index: 0, rotation: 90 }] })).toBe(true)
    expect(valid({ operation: 'pdf_to_images', ...base, format: 'png', dpi: 150 })).toBe(true)
    expect(valid({ operation: 'images_to_pdf', inputIds: ['a'], outputId: 'o', pageSize: 'a4' })).toBe(true)
    expect(valid({ operation: 'pdf_to_text', ...base, pageMarkers: true })).toBe(true)
    expect(valid({ operation: 'text_to_pdf', ...base })).toBe(true)
    expect(valid({ operation: 'document_to_pdf', ...base })).toBe(true)
    expect(
      valid({ operation: 'ocr', ...base, format: 'text', languages: ['eng', 'urd'], dpi: 300, useExistingText: true, pageMarkers: false }),
    ).toBe(true)
    expect(valid({ operation: 'pdf_to_docx', ...base })).toBe(true)
    expect(valid({ operation: 'pdf_to_docx', ...base, ranges: [{ start: 1, end: 3 }] })).toBe(true)
    expect(valid({ operation: 'compress', ...base, preset: 'smallest' })).toBe(true)
  })

  it('rejects out-of-range and unknown values', () => {
    expect(valid({ operation: 'pdf_to_images', ...base, format: 'png', dpi: 71 })).toBe(false)
    expect(valid({ operation: 'pdf_to_images', ...base, format: 'png', dpi: 301 })).toBe(false)
    expect(valid({ operation: 'pdf_to_images', ...base, format: 'gif', dpi: 150 })).toBe(false)
    expect(valid({ operation: 'compress', ...base, preset: 'extreme' })).toBe(false)
    expect(valid({ operation: 'images_to_pdf', inputIds: [], outputId: 'o', pageSize: 'a4' })).toBe(false)
    expect(valid({ operation: 'images_to_pdf', inputIds: ['a'], outputId: 'o', pageSize: 'huge' })).toBe(false)
    expect(valid({ operation: 'format_disk', ...base })).toBe(false)
  })

  it('rejects unsafe or out-of-range OCR options', () => {
    const ocr = { operation: 'ocr', ...base, format: 'text', languages: ['eng'], dpi: 300, useExistingText: true, pageMarkers: true }
    expect(valid({ ...ocr, languages: ['--help'] })).toBe(false)
    expect(valid({ ...ocr, languages: ['eng; rm -rf /'] })).toBe(false)
    expect(valid({ ...ocr, languages: [] })).toBe(false)
    expect(valid({ ...ocr, languages: ['eng', 'deu', 'fra', 'spa', 'ita', 'por'] })).toBe(false)
    expect(valid({ ...ocr, dpi: 100 })).toBe(false)
    expect(valid({ ...ocr, format: 'docx' })).toBe(false)
  })

  it('requires the fields each split mode needs', () => {
    expect(valid({ operation: 'split', ...base, mode: 'extract' })).toBe(false)
    expect(valid({ operation: 'split', ...base, mode: 'chunks' })).toBe(false)
    expect(valid({ operation: 'split', ...base, mode: 'chunks', chunkSize: 3 })).toBe(true)
  })

  it('does not accept paths in place of ids', () => {
    expect(valid({ operation: 'compress', inputId: '', outputId: 'b', preset: 'light' })).toBe(false)
    expect(valid({ operation: 'merge', inputIds: ['a'], outputId: 'o' })).toBe(false)
  })
})
