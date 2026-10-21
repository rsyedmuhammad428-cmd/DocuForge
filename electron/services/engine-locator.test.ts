import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveEngineCommand, type LocatorOptions } from './engine-locator'

const base: LocatorOptions = {
  isPackaged: false,
  appPath: path.join('proj'),
  resourcesPath: path.join('res'),
  platform: 'win32',
  env: {},
  exists: () => false,
}

describe('resolveEngineCommand', () => {
  it('uses the bundled executable in a packaged app', () => {
    const command = resolveEngineCommand({ ...base, isPackaged: true })
    expect(command.command).toBe(path.join('res', 'engine', 'docuforge-engine.exe'))
    expect(command.args).toEqual([])
  })

  it('prefers the virtual environment in development', () => {
    const command = resolveEngineCommand({ ...base, exists: () => true })
    expect(command.command).toBe(path.join('proj', 'python-engine', '.venv', 'Scripts', 'python.exe'))
    expect(command.args).toEqual(['-m', 'docuforge_engine'])
    expect(command.cwd).toBe(path.join('proj', 'python-engine'))
  })

  it('uses the Unix layout on other platforms', () => {
    const command = resolveEngineCommand({ ...base, platform: 'linux', exists: () => true })
    expect(command.command).toBe(path.join('proj', 'python-engine', '.venv', 'bin', 'python'))
  })

  it('honours DOCUFORGE_PYTHON over everything else', () => {
    const command = resolveEngineCommand({
      ...base,
      exists: () => true,
      env: { DOCUFORGE_PYTHON: 'C:\\Python312\\python.exe' },
    })
    expect(command.command).toBe('C:\\Python312\\python.exe')
  })

  it('falls back to python on the PATH and explains how to fix a missing engine', () => {
    const command = resolveEngineCommand(base)
    expect(command.command).toBe('python')
    expect(command.unavailableMessage).toMatch(/engine:setup/)
  })
})
