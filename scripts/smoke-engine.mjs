import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Runs every kind of operation against the packaged engine (built by "npm run engine:build").
const isWindows = process.platform === 'win32'
const engineDirectory = path.resolve('python-engine')
const python = path.join(engineDirectory, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const packaged = path.join(engineDirectory, 'dist', 'docuforge-engine', isWindows ? 'docuforge-engine.exe' : 'docuforge-engine')

const result = spawnSync(python, ['tools/smoke_packaged.py', packaged], { stdio: 'inherit', cwd: engineDirectory })
process.exit(result.status ?? 1)
