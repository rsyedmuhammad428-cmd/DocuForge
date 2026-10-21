import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { removeStaleTempFiles } from './temp-cleanup'

describe('removeStaleTempFiles', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'docuforge-clean-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('removes only the temp files of the given job', async () => {
    for (const name of [
      '.docuforge-job1-1.tmp',
      '.docuforge-job1-2.tmp',
      '.docuforge-job2-1.tmp',
      'report.pdf',
      '.docuforge-job1-notes.txt',
    ]) {
      await writeFile(path.join(directory, name), 'x')
    }

    expect(await removeStaleTempFiles(directory, 'job1')).toBe(2)
    expect((await readdir(directory)).sort()).toEqual([
      '.docuforge-job1-notes.txt',
      '.docuforge-job2-1.tmp',
      'report.pdf',
    ])
  })

  it('does nothing for a folder that does not exist', async () => {
    expect(await removeStaleTempFiles(path.join(directory, 'missing'), 'job1')).toBe(0)
  })
})
