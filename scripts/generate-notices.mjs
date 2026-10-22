import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Builds build/THIRD_PARTY_NOTICES.txt: the licenses of the free software inside the installer.
// Electron/Chromium add their own license files when the installer is built.
const isWindows = process.platform === 'win32'
const python = path.resolve('python-engine', '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
const lines = []
const rule = '='.repeat(78)

lines.push('THIRD-PARTY SOFTWARE IN DOCUFORGE', '', 'DocuForge itself is licensed under the GNU AGPL v3 (see LICENSE).',
  'It includes the following free software. Each is used under its own license, given below.', '')

lines.push(rule, 'RUNTIME AND TOOLS', rule, '',
  'Python (the language runtime packaged with the PDF engine) - PSF License - python.org/psf/license',
  'PyInstaller (builds the packaged engine) - GPL-2.0-or-later with a bootloader exception that',
  '  permits distributing the programs it builds - pyinstaller.org',
  'Electron and Chromium - MIT and other licenses; their notices are installed in LICENSE.electron.txt',
  '  and LICENSES.chromium.html next to the program.',
  'Tesseract OCR (only if bundled) - Apache-2.0 - github.com/tesseract-ocr/tesseract', '')

// Python packages inside the engine
lines.push(rule, 'PYTHON PACKAGES IN THE PDF ENGINE', rule, '')
try {
  const packages = ['pymupdf', 'pillow', 'pdf2docx', 'mammoth', 'python-docx', 'opencv-python-headless', 'numpy', 'fonttools', 'lxml', 'cobble', 'fire', 'termcolor', 'typing_extensions']
  const output = execFileSync(python, ['-m', 'piplicenses', '--format=plain-vertical', '--with-license-file', '--no-license-path', '--with-urls',
    '--packages', ...packages], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  lines.push(output.trim(), '')
} catch {
  console.error('Could not read the Python licenses. Run "npm run engine:setup" and "npm run engine:build" first.')
  process.exit(1)
}

// JavaScript packages that end up inside the app window
lines.push(rule, 'JAVASCRIPT PACKAGES IN THE APP WINDOW', rule, '')
for (const name of ['react', 'react-dom', 'react-router', 'lucide-react', 'zod', 'tailwindcss']) {
  const folder = path.join('node_modules', name)
  const meta = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(folder).find((f) => /^licen[cs]e/i.test(f))
  lines.push(`${meta.name} ${meta.version} - ${typeof meta.license === 'string' ? meta.license : 'see below'}`, '')
  if (licenseFile) lines.push(readFileSync(path.join(folder, licenseFile), 'utf8').trim(), '')
  lines.push('-'.repeat(78), '')
}

mkdirSync('build', { recursive: true })
writeFileSync('build/THIRD_PARTY_NOTICES.txt', lines.join('\r\n'), 'utf8')
console.log(`Wrote build/THIRD_PARTY_NOTICES.txt (${lines.length} lines)`)
