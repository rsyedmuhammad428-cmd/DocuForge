import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sweepStaleTempFiles } from './temp-sweep'

describe('sweepStaleTempFiles', () => {
  let root: string
  let output: string
  let systemTemp: string
  const hour = 60 * 60 * 1000

  const age = (target: string, ms: number) => {
    const when = new Date(Date.now() - ms)
    return utimes(target, when, when)
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'docuforge-sweep-'))
    output = path.join(root, 'output')
    systemTemp = path.join(root, 'systemtemp')
    await mkdir(output)
    await mkdir(systemTemp)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('removes old temp files and old engine work folders, and nothing else', async () => {
    const oldFile = path.join(output, '.docuforge-job1-1.tmp')
    const newFile = path.join(output, '.docuforge-job2-1.tmp')
    const userFile = path.join(output, 'report.pdf')
    const lookalike = path.join(output, '.docuforge-notes.txt')
    for (const file of [oldFile, newFile, userFile, lookalike]) await writeFile(file, 'x')
    await age(oldFile, 2 * hour)
    await age(userFile, 5 * hour)
    await age(lookalike, 5 * hour)

    const oldFolder = path.join(systemTemp, 'docuforge-ocr-abc')
    const newFolder = path.join(systemTemp, 'docuforge-lo-xyz')
    const otherFolder = path.join(systemTemp, 'someone-elses-folder')
    for (const folder of [oldFolder, newFolder, otherFolder]) {
      await mkdir(folder)
      await writeFile(path.join(folder, 'x'), 'x')
    }
    await age(oldFolder, 3 * hour)
    await age(otherFolder, 3 * hour)

    const result = await sweepStaleTempFiles({ directories: [output, output], systemTempDirectory: systemTemp, maxAgeMs: hour })

    expect(result).toEqual({ files: 1, folders: 1 })
    expect((await readdir(output)).sort()).toEqual(['.docuforge-job2-1.tmp', '.docuforge-notes.txt', 'report.pdf'])
    expect((await readdir(systemTemp)).sort()).toEqual(['docuforge-lo-xyz', 'someone-elses-folder'])
  })

  it('ignores folders that do not exist', async () => {
    expect(
      await sweepStaleTempFiles({
        directories: [path.join(root, 'missing')],
        systemTempDirectory: path.join(root, 'also-missing'),
        maxAgeMs: hour,
      }),
    ).toEqual({ files: 0, folders: 0 })
  })
})
