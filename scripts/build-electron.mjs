import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

/**
 * Bundles the Electron main process and preload script into dist-electron/.
 * The preload script must be one self-contained file because it runs in a sandbox.
 */
export async function buildElectron() {
  await build({
    entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
    outdir: 'dist-electron',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron()
}
