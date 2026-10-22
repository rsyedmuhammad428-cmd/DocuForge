import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Starts the built app on a virtual screen (Linux: needs xvfb), and saves PNG screenshots of its pages.
// Development tool, used to make the website's screenshots. Usage: node scripts/screenshots.mjs OUT_DIR [light|dark]
const outDir = path.resolve(process.argv[2] ?? 'website/assets/screenshots')
const theme = process.argv[3] === 'dark' ? 'dark' : 'light'
mkdirSync(outDir, { recursive: true })

// A throwaway user-data folder with sample settings and sample history, so the pages have something to show.
const userData = mkdtempSync(path.join(tmpdir(), 'docuforge-shots-'))
const hours = (n) => Date.now() - n * 3_600_000
// Real (empty) files, so "Open file" is offered. The folder shown is what a Windows user would see.
mkdirSync(path.join(userData, 'results'))
const entry = (id, operation, title, status, ago, extra = {}) => {
  let outputPath = null
  if (extra.outputName) {
    outputPath = path.join(userData, 'results', extra.outputName)
    writeFileSync(outputPath, 'sample')
  }
  return { id, operation, title, status, finishedAt: hours(ago), inputNames: [], outputName: null, outputPath,
    outputLocation: null, outputCount: 0, totalBytes: null, errorMessage: null, ...extra }
}
writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ theme, defaultOutputFolder: null, saveHistory: true, cleanupTempFiles: true }))
writeFileSync(path.join(userData, 'history.json'), JSON.stringify({ version: 1, entries: [
  entry('a', 'compress', 'Compress Annual report.pdf', 'succeeded', 1, { outputName: 'Annual report_compressed.pdf', outputLocation: 'C:\\Users\\You\\Documents', outputCount: 1, totalBytes: 1_450_000, inputNames: ['Annual report.pdf'] }),
  entry('b', 'pdf_to_docx', 'Convert Assignment 02.pdf to Word', 'succeeded', 5, { outputName: 'Assignment 02.docx', outputLocation: 'C:\\Users\\You\\Documents', outputCount: 1, totalBytes: 380_000, inputNames: ['Assignment 02.pdf'] }),
  entry('c', 'merge', 'Merge 4 PDFs', 'succeeded', 26, { outputName: 'Application pack.pdf', outputLocation: 'C:\\Users\\You\\Desktop', outputCount: 1, totalBytes: 2_900_000, inputNames: ['CV.pdf'] }),
  entry('d', 'ocr', 'Recognize text in Scan 0031.pdf', 'failed', 30, { errorMessage: 'No text could be recognized. Check that you chose the right language and that the scan is readable.' }),
] }))

const electron = path.resolve('node_modules/electron/dist/electron')
const port = 9333
const app = spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x900x24', electron, '.', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: 'ignore', detached: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function pageSocket() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = pages.find((p) => p.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('The app window did not start.')
}

const socket = new WebSocket(await pageSocket())
await new Promise((resolve) => socket.addEventListener('open', resolve))
let nextId = 0
const waiting = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  waiting.get(message.id)?.(message)
})
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; waiting.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await sleep(2500)

const pages = [
  ['home', '#/'], ['convert', '#/convert'], ['compress', '#/compress'], ['ocr', '#/ocr'],
  ['organize', '#/organize'], ['recent', '#/recent'], ['settings', '#/settings'],
]
for (const [name, hash] of pages) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(hash)}` })
  await sleep(hash === '#/ocr' || hash === '#/settings' ? 4500 : 2000)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, `${name}-${theme}.png`), Buffer.from(shot.result.data, 'base64'))
  console.log('saved', `${name}-${theme}.png`)
}
socket.close()
try { process.kill(-app.pid) } catch { /* already closed */ }
process.exit(0)
