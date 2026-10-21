import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Prints which Python packages and optional programs the engine can use.
const engineDirectory = path.resolve('python-engine')
const python =
  process.platform === 'win32'
    ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
    : path.join(engineDirectory, '.venv', 'bin', 'python')

const result = spawnSync(python, ['-m', 'docuforge_engine', '--check'], { stdio: 'inherit', cwd: engineDirectory })
if (result.error) {
  console.error('The engine environment is missing. Run "npm run engine:setup" first.')
  process.exit(1)
}
process.exit(result.status ?? 1)
