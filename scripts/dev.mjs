import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { buildElectron } from './build-electron.mjs'

// Starts the Vite dev server (hot reload for the UI), bundles the Electron
// code once, and launches Electron pointed at the dev server.
// Changes under electron/ or shared/ need a restart of `npm run dev`.
// Warn early if the Python engine is not set up, instead of failing later inside a job.
const venvPython = path.resolve(
  process.platform === 'win32'
    ? path.join('python-engine', '.venv', 'Scripts', 'python.exe')
    : path.join('python-engine', '.venv', 'bin', 'python'),
)
if (!existsSync(venvPython)) {
  console.warn('\n!! The PDF engine is not set up. Run "npm run engine:setup", then start again.\n')
} else {
  const check = spawn(venvPython, ['-m', 'docuforge_engine', '--check'], {
    cwd: path.resolve('python-engine'),
    stdio: 'ignore',
  })
  check.on('error', () => {
    console.warn('\n!! The PDF engine could not be started. Run "npm run engine:setup", then start again.\n')
  })
  check.on('exit', (code) => {
    if (code !== 0) console.warn('\n!! The PDF engine is missing packages. Run "npm run engine:setup" (or "npm run engine:check" for details).\n')
  })
}

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()

const devServerUrl = server.resolvedUrls?.local[0]
if (!devServerUrl) {
  console.error('The Vite dev server did not report a URL.')
  await server.close()
  process.exit(1)
}

await buildElectron()

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
})

async function shutdown(exitCode) {
  await server.close()
  process.exit(exitCode)
}

electron.on('exit', (code) => void shutdown(code ?? 0))
process.on('SIGINT', () => electron.kill())
process.on('SIGTERM', () => electron.kill())
