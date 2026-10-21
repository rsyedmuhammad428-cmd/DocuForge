import { describe, expect, it } from 'vitest'
import { defaultLanguages, languageLabel } from './languages'

describe('OCR languages', () => {
  it('names known languages and falls back to the code', () => {
    expect(languageLabel('urd')).toBe('Urdu (urd)')
    expect(languageLabel('xyz')).toBe('xyz')
  })

  it('defaults to English, else the first installed language, else nothing', () => {
    expect(defaultLanguages(['deu', 'eng'])).toEqual(['eng'])
    expect(defaultLanguages(['deu', 'fra'])).toEqual(['deu'])
    expect(defaultLanguages([])).toEqual([])
  })
})
