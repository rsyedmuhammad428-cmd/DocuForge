import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Runs the Python engine tests with the project's virtual environment.
const engineDirectory = path.resolve('python-engine')
const python =
  process.platform === 'win32'
    ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
    : path.join(engineDirectory, '.venv', 'bin', 'python')

const result = spawnSync(python, ['-m', 'pytest', '-q'], { stdio: 'inherit', cwd: engineDirectory })
if (result.error) {
  console.error('The engine environment is missing. Run "npm run engine:setup" first.')
  process.exit(1)
}
process.exit(result.status ?? 1)
