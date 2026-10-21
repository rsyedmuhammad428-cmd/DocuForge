
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildElectron } from './build-electron.mjs'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const engineDirectory = path.join(projectRoot, 'python-engine')

const venvPython =
  process.platform === 'win32'
    ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
    : path.join(engineDirectory, '.venv', 'bin', 'python')

if (!existsSync(venvPython)) {
  console.warn(
    '\n!! The PDF engine is not set up. Run "npm run engine:setup", then start again.\n'
  )
} else {
  const check = spawn(
    venvPython,
    ['-m', 'docuforge_engine', '--check'],
    {
      cwd: engineDirectory,
      stdio: 'inherit',
      windowsHide: true,
    }
  )

  check.on('error', (error) => {
    console.warn('\n!! Could not start the PDF engine check:', error.message)
  })

  check.on('exit', (code) => {
    if (code !== 0) {
      console.warn(
        '\n!! The PDF engine check failed. Run "npm run engine:check" for details.\n'
      )
    }
  })
}

const server = await createServer({
  configFile: path.join(projectRoot, 'vite.config.ts'),
})

await server.listen()

const devServerUrl = server.resolvedUrls?.local[0]

if (!devServerUrl) {
  console.error('The Vite dev server did not report a URL.')
  await server.close()
  process.exit(1)
}

await buildElectron()

const electron = spawn(electronPath, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

async function shutdown(exitCode) {
  await server.close()
  process.exit(exitCode)
}

electron.on('error', (error) => {
  console.error('Failed to start Electron:', error)
  void shutdown(1)
})

electron.on('exit', (code) => void shutdown(code ?? 0))

process.on('SIGINT', () => electron.kill())
process.on('SIGTERM', () => electron.kill())
