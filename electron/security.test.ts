import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTrustedUrlCheck } from './security'

const distDirectory = path.resolve('app', 'dist')
const distUrl = pathToFileURL(distDirectory).toString()

describe('createTrustedUrlCheck (packaged)', () => {
  const isTrusted = createTrustedUrlCheck({ devServerUrl: undefined, distDirectory })

  it('trusts pages inside the dist directory, including hash routes', () => {
    expect(isTrusted(`${distUrl}/index.html`)).toBe(true)
    expect(isTrusted(`${distUrl}/index.html#/settings`)).toBe(true)
  })

  it('rejects other files and websites', () => {
    expect(isTrusted(`${pathToFileURL(path.resolve('other')).toString()}/index.html`)).toBe(false)
    expect(isTrusted(`${distUrl}-evil/index.html`)).toBe(false)
    expect(isTrusted('https://example.com')).toBe(false)
    expect(isTrusted('http://localhost:5173/')).toBe(false)
  })
})

describe('createTrustedUrlCheck (development)', () => {
  const isTrusted = createTrustedUrlCheck({
    devServerUrl: 'http://localhost:5173/',
    distDirectory,
  })

  it('trusts only the dev server origin', () => {
    expect(isTrusted('http://localhost:5173/')).toBe(true)
    expect(isTrusted('http://localhost:5173/#/merge')).toBe(true)
    expect(isTrusted('http://localhost:5174/')).toBe(false)
    expect(isTrusted('https://example.com')).toBe(false)
    expect(isTrusted('not a url')).toBe(false)
  })
})
