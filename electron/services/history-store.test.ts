import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '../../shared/history'
import { HistoryStore } from './history-store'

const entry = (id: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  operation: 'merge',
  title: `Job ${id}`,
  status: 'succeeded',
  finishedAt: 1000,
  inputNames: ['a.pdf'],
  outputName: 'out.pdf',
  outputPath: path.join('C:', 'Docs', 'out.pdf'),
  outputLocation: path.join('C:', 'Docs'),
  outputCount: 1,
  totalBytes: 10,
  errorMessage: null,
  ...extra,
})

describe('HistoryStore', () => {
  let directory: string
  let file: string
  let enabled = true

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'docuforge-history-'))
    file = path.join(directory, 'history.json')
    enabled = true
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  const open = (limit?: number) => new HistoryStore(file, { limit, isEnabled: () => enabled })

  it('starts empty when there is no file', () => {
    expect(open().list()).toEqual([])
  })

  it('records newest first and survives a restart', async () => {
    const store = open()
    store.record(entry('1'))
    store.record(entry('2'))
    await store.flush()
    expect(store.list().map((e) => e.id)).toEqual(['2', '1'])
    expect(open().list().map((e) => e.id)).toEqual(['2', '1'])
  })

  it('keeps only the newest entries up to its limit', async () => {
    const store = open(3)
    for (const id of ['1', '2', '3', '4', '5']) store.record(entry(id))
    await store.flush()
    expect(store.list().map((e) => e.id)).toEqual(['5', '4', '3'])
    expect(open(3).list()).toHaveLength(3)
  })

  it('does not record while history is turned off', async () => {
    const store = open()
    enabled = false
    store.record(entry('1'))
    await store.flush()
    expect(store.list()).toEqual([])
    enabled = true
    store.record(entry('2'))
    expect(store.list()).toHaveLength(1)
    await store.flush()
  })

  it('clears everything, including what is saved on disk', async () => {
    const store = open()
    store.record(entry('1'))
    await store.clear()
    expect(store.list()).toEqual([])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, entries: [] })
    expect(open().list()).toEqual([])
  })

  it('drops damaged entries and survives a damaged file', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(
      file,
      JSON.stringify({ version: 1, entries: [entry('good'), { id: 'bad' }, 'junk', { ...entry('worse'), status: 'exploded' }] }),
    )
    expect(open().list().map((e) => e.id)).toEqual(['good'])

    await writeFile(file, '{ not json')
    expect(open().list()).toEqual([])
  })

  it('replaces an entry with the same id instead of duplicating it', async () => {
    const store = open()
    store.record(entry('1', { title: 'old' }))
    store.record(entry('1', { title: 'new' }))
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]?.title).toBe('new')
    await store.flush()
  })

  it('lists the folders results were saved to, without repeats', async () => {
    const store = open()
    store.record(entry('1'))
    store.record(entry('2', { outputLocation: path.join('D:', 'Other') }))
    store.record(entry('3'))
    store.record(entry('4', { outputLocation: null, outputPath: null, status: 'failed' }))
    expect(store.outputDirectories().sort()).toEqual([path.join('C:', 'Docs'), path.join('D:', 'Other')].sort())
    await store.flush()
  })

  it('never stores more than the fields of an entry', async () => {
    const store = open()
    store.record({ ...entry('1'), secret: 'document text' } as HistoryEntry)
    await store.flush()
    // The schema is not strict, so extra fields would be stripped when the file is read back.
    expect(JSON.stringify(open().list())).not.toContain('document text')
  })
})
