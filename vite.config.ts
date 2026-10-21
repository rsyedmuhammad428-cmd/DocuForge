import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Applied to production builds only. The dev server needs inline scripts and a
// WebSocket for hot reload, which a strict policy would block.
// style-src allows inline styles because React and some libraries set style
// attributes; scripts remain restricted to files bundled with the app.
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'docuforge-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      return html.replace('</head>', `    ${tag}\n  </head>`)
    },
  }
}

export default defineConfig({
  // Relative asset paths are required because the packaged app loads index.html from disk.
  base: './',
  plugins: [react(), tailwindcss(), productionCsp()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'electron/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
})
