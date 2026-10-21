import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsUpdateSchema, parseSettings } from './settings'

describe('parseSettings', () => {
  it('keeps valid values', () => {
    expect(parseSettings({ theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('falls back to defaults for missing fields', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults for invalid values', () => {
    expect(parseSettings({ theme: 'purple' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ theme: 42 })).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults when the input is not an object', () => {
    for (const input of [null, undefined, 'text', 7, [], true]) {
      expect(parseSettings(input)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('validates the default output folder', () => {
    expect(parseSettings({ defaultOutputFolder: 'C:\\Docs' }).defaultOutputFolder).toBe('C:\\Docs')
    expect(parseSettings({ defaultOutputFolder: '' }).defaultOutputFolder).toBeNull()
    expect(parseSettings({ defaultOutputFolder: 5 }).defaultOutputFolder).toBeNull()
  })

  it('validates the history and cleanup switches', () => {
    expect(parseSettings({}).saveHistory).toBe(true)
    expect(parseSettings({ saveHistory: false }).saveHistory).toBe(false)
    expect(parseSettings({ saveHistory: 'no' }).saveHistory).toBe(true)
    expect(parseSettings({ cleanupTempFiles: false }).cleanupTempFiles).toBe(false)
  })

  it('drops unknown keys', () => {
    expect(parseSettings({ theme: 'light', extra: 'x' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' })
  })
})

describe('SettingsUpdateSchema', () => {
  it('accepts a valid partial update', () => {
    expect(SettingsUpdateSchema.parse({ theme: 'light' })).toEqual({ theme: 'light' })
    expect(SettingsUpdateSchema.parse({})).toEqual({})
  })

  it('rejects invalid values and unknown keys', () => {
    expect(SettingsUpdateSchema.safeParse({ theme: 'blue' }).success).toBe(false)
    expect(SettingsUpdateSchema.safeParse({ unknown: true }).success).toBe(false)
    expect(SettingsUpdateSchema.safeParse('light').success).toBe(false)
  })

  it('accepts the history and cleanup switches', () => {
    expect(SettingsUpdateSchema.safeParse({ saveHistory: false, cleanupTempFiles: true }).success).toBe(true)
    expect(SettingsUpdateSchema.safeParse({ saveHistory: 'false' }).success).toBe(false)
  })

  it('lets the renderer clear the output folder but not set one', () => {
    expect(SettingsUpdateSchema.safeParse({ defaultOutputFolder: null }).success).toBe(true)
    expect(SettingsUpdateSchema.safeParse({ defaultOutputFolder: 'C:\\Windows' }).success).toBe(false)
  })
})
