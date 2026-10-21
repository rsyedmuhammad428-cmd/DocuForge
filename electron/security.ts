import { pathToFileURL } from 'node:url'

/**
 * Builds a check for "is this URL one of our own pages?".
 *
 * In development that is the Vite dev server origin. In a packaged app it is
 * any file inside the bundled `dist` directory. Everything else is untrusted.
 */
export function createTrustedUrlCheck(options: {
  devServerUrl: string | undefined
  distDirectory: string
}): (url: string) => boolean {
  const devOrigin = options.devServerUrl ? new URL(options.devServerUrl).origin : undefined
  const distPrefix = `${pathToFileURL(options.distDirectory).toString()}/`

  return (url: string): boolean => {
    if (devOrigin !== undefined) {
      try {
        return new URL(url).origin === devOrigin
      } catch {
        return false
      }
    }
    return url.startsWith(distPrefix)
  }
}
