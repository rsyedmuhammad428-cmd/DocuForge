import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Creates python-engine/.venv and installs python-engine/requirements.txt into it.
// Run once after cloning, and again whenever requirements.txt changes (after an update).
const engineDirectory = path.resolve('python-engine')
const isWindows = process.platform === 'win32'
const venvPython = isWindows
  ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
  : path.join(engineDirectory, '.venv', 'bin', 'python')

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: 'inherit', cwd: engineDirectory, ...options })
}

function findPython() {
  const candidates = isWindows
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]]
  for (const [command, prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8' })
    if (probe.status === 0) return { command, prefix }
  }
  return null
}

if (!existsSync(venvPython)) {
  const python = findPython()
  if (python === null) {
    console.error('Python 3 was not found. Install Python 3.12 or newer from https://www.python.org/downloads/')
    process.exit(1)
  }
  console.log('Creating the Python environment in python-engine/.venv ...')
  const created = run(python.command, [...python.prefix, '-m', 'venv', '.venv'])
  if (created.status !== 0) process.exit(created.status ?? 1)
}

console.log('Installing the engine requirements ...')
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])

if (run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt']).status !== 0) {
  // One package that cannot be installed (for example no build for your Python version) makes pip
  // install nothing at all. Install them one at a time, so everything that can be installed is.
  console.log('\nInstalling the packages one at a time to find the one that fails ...\n')
  const requirements = readFileSync(path.join(engineDirectory, 'requirements.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  const failed = requirements.filter((requirement) => run(venvPython, ['-m', 'pip', 'install', requirement]).status !== 0)
  if (failed.length > 0) {
    console.error(`\nThese packages could not be installed: ${failed.join(', ')}`)
    console.error('DocuForge still works without some of them; the check below says which features are affected.')
  }
}

console.log('\nChecking the engine ...\n')
const check = run(venvPython, ['-m', 'docuforge_engine', '--check'])
process.exit(check.status ?? 1)
