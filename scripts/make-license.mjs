import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// Builds build/license.txt: the text shown on the installer's license page.
// = installer/PRIVACY.txt + the full AGPL-3.0 text, with Windows line endings.
const config = JSON.parse(readFileSync('app.config.json', 'utf8'))
const configured = !config.githubOwner.startsWith('YOUR_')
const source = configured
  ? `https://github.com/${config.githubOwner}/${config.githubRepo}`
  : 'available from the place you downloaded DocuForge from'

const text = readFileSync('installer/PRIVACY.txt', 'utf8').replace('{{SOURCE}}', source) + readFileSync('LICENSE', 'utf8')
mkdirSync('build', { recursive: true })
writeFileSync('build/license.txt', text.replace(/\r?\n/g, '\r\n'), 'utf8')
console.log(`Wrote build/license.txt (${text.split('\n').length} lines). Source: ${source}`)
