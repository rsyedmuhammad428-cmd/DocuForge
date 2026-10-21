import { existsSync } from 'node:fs'
import path from 'node:path'

export interface EngineCommand {
  command: string
  args: string[]
  cwd: string | undefined
  /** Shown to the user if the engine cannot be started. */
  unavailableMessage: string
}

export interface LocatorOptions {
  isPackaged: boolean
  /** Folder of the app: the project root in development. */
  appPath: string
  /** Electron's resources folder (packaged builds only). */
  resourcesPath: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  exists?: (candidate: string) => boolean
}

/**
 * Decides how to start the Python engine.
 *
 * Packaged app: the bundled engine executable (added in Phase 5).
 * Development: DOCUFORGE_PYTHON if set, else the project's virtual environment, else `python`.
 */
export function resolveEngineCommand(options: LocatorOptions): EngineCommand {
  const exists = options.exists ?? existsSync

  if (options.isPackaged) {
    return {
      command: path.join(options.resourcesPath, 'engine', 'docuforge-engine.exe'),
      args: [],
      cwd: undefined,
      unavailableMessage:
        'The PDF engine is missing from this installation. Please reinstall DocuForge.',
    }
  }

  const engineDirectory = path.join(options.appPath, 'python-engine')
  const venvPython =
    options.platform === 'win32'
      ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
      : path.join(engineDirectory, '.venv', 'bin', 'python')

  const override = options.env['DOCUFORGE_PYTHON']
  const python =
    override !== undefined && override !== ''
      ? override
      : exists(venvPython)
        ? venvPython
        : options.platform === 'win32'
          ? 'python'
          : 'python3'

  return {
    command: python,
    args: ['-m', 'docuforge_engine'],
    cwd: engineDirectory,
    unavailableMessage:
      'The PDF engine could not be started. Run "npm run engine:setup" once, then restart the app.',
  }
}
