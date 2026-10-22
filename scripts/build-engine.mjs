import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'

// Builds python-engine/dist/docuforge-engine/ : the Python engine as a standalone program.
// Run on Windows to get a Windows engine. The result goes into the installer (see electron-builder.yml).
const engineDirectory = path.resolve('python-engine')
const isWindows = process.platform === 'win32'
const python = isWindows
  ? path.join(engineDirectory, '.venv', 'Scripts', 'python.exe')
  : path.join(engineDirectory, '.venv', 'bin', 'python')

function run(args, label) {
  const result = spawnSync(python, args, { stdio: 'inherit', cwd: engineDirectory })
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`)
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(python)) {
  console.error('The engine environment is missing. Run "npm run engine:setup" first.')
  process.exit(1)
}

console.log('Installing the build tools ...')
run(['-m', 'pip', 'install', '-r', 'requirements-build.txt'], 'installing build tools')

console.log('Checking that every required package is installed ...')
run(['-m', 'docuforge_engine', '--check'], 'engine check (run "npm run engine:setup")')

rmSync(path.join(engineDirectory, 'dist'), { recursive: true, force: true })
rmSync(path.join(engineDirectory, 'build'), { recursive: true, force: true })

console.log('\nBuilding the engine program (this takes a few minutes) ...\n')
run(
  [
    '-m', 'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onedir',                     // a folder, not one big file: it starts faster for every job
    '--name', 'docuforge-engine',
    '--console',                    // it talks over stdin/stdout; the app starts it without a window
    // Operations are loaded by name at run time, so PyInstaller cannot see them. Include them all.
    '--collect-submodules', 'docuforge_engine',
    // These packages carry data files (templates, style maps, fonts) that must travel with them.
    '--collect-all', 'pdf2docx',
    '--collect-all', 'docx',
    '--collect-all', 'mammoth',
    '--collect-all', 'pymupdf',
    '--hidden-import', 'fitz',      // pdf2docx still imports PyMuPDF under its old name
    '--exclude-module', 'tkinter',
    '--exclude-module', 'pytest',
    'engine_main.py',
  ],
  'PyInstaller',
)

console.log('\nThe engine program is ready in python-engine/dist/docuforge-engine/')
