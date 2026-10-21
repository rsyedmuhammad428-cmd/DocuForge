import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS as DEFAULTS } from '../../shared/settings'
import { SettingsStore } from './settings-store'

describe('SettingsStore', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'docuforge-settings-'))
    filePath = path.join(directory, 'settings.json')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it('uses defaults when the file does not exist', () => {
    expect(new SettingsStore(filePath).get()).toEqual(DEFAULTS)
  })

  it('uses defaults when the file is not valid JSON', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(filePath, '{ not json', 'utf8')
    expect(new SettingsStore(filePath).get()).toEqual(DEFAULTS)
  })

  it('repairs invalid values while keeping valid ones', async () => {
    await writeFile(filePath, JSON.stringify({ theme: 'neon' }), 'utf8')
    expect(new SettingsStore(filePath).get()).toEqual(DEFAULTS)
  })

  it('persists updates and reloads them', async () => {
    const store = new SettingsStore(filePath)
    await store.update({ theme: 'dark' })

    expect(store.get()).toEqual({ ...DEFAULTS, theme: 'dark' })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ ...DEFAULTS, theme: 'dark' })
    expect(new SettingsStore(filePath).get()).toEqual({ ...DEFAULTS, theme: 'dark' })
  })

  it('keeps the last value when updates are issued back to back', async () => {
    const store = new SettingsStore(filePath)
    await Promise.all([store.update({ theme: 'light' }), store.update({ theme: 'dark' })])

    expect(store.get()).toEqual({ ...DEFAULTS, theme: 'dark' })
    expect(new SettingsStore(filePath).get()).toEqual({ ...DEFAULTS, theme: 'dark' })
  })

  it('ignores undefined fields in a patch', async () => {
    const store = new SettingsStore(filePath)
    await store.update({ theme: 'light' })
    await store.update({ theme: undefined })
    expect(store.get()).toEqual({ ...DEFAULTS, theme: 'light' })
  })

  it('rolls back and reports an error when saving fails', async () => {
    // A regular file where the settings directory should be makes the write fail.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const blocked = path.join(directory, 'blocked', 'settings.json')
    await writeFile(path.join(directory, 'blocked'), 'a file, not a directory', 'utf8')
    const store = new SettingsStore(blocked)

    await expect(store.update({ theme: 'dark' })).rejects.toThrow()
    expect(store.get()).toEqual(DEFAULTS)
  })
})
