import { describe, expect, it } from 'vitest'
import { FileRegistry } from './file-registry'

describe('FileRegistry', () => {
  it('issues opaque ids and resolves them back to paths', () => {
    const registry = new FileRegistry()
    const ref = registry.addInput('/docs/report.pdf', 1234)

    expect(ref).toMatchObject({ name: 'report.pdf', sizeBytes: 1234 })
    expect(ref.id).not.toContain('report')
    expect(registry.getInput(ref.id)).toEqual({ path: '/docs/report.pdf', name: 'report.pdf' })
  })

  it('does not resolve ids it did not issue', () => {
    const registry = new FileRegistry()
    expect(registry.getInput('C:\\Windows\\system32\\config\\SAM')).toBeUndefined()
    expect(registry.getOutput('anything')).toBeUndefined()
  })

  it('forgets released files', () => {
    const registry = new FileRegistry()
    const ref = registry.addInput('/a.pdf', 1)
    registry.release([ref.id, 'unknown'])
    expect(registry.getInput(ref.id)).toBeUndefined()
  })

  it('describes file and folder outputs', () => {
    const registry = new FileRegistry()
    const file = registry.addOutput('file', '/out/merged.pdf')
    const folder = registry.addOutput('folder', '/out')

    expect(file).toMatchObject({ name: 'merged.pdf', location: '/out' })
    expect(folder).toMatchObject({ name: 'out', location: '/out' })
    expect(registry.getOutput(file.id)).toEqual({ kind: 'file', path: '/out/merged.pdf' })
  })

  it('stops accepting inputs beyond its limit', () => {
    const registry = new FileRegistry()
    for (let i = 0; i < 1000; i += 1) registry.addInput(`/f${i}.pdf`, 1)
    expect(() => registry.addInput('/one-more.pdf', 1)).toThrow(/too many files/i)
  })

  it('keeps only the most recent outputs', () => {
    const registry = new FileRegistry()
    const first = registry.addOutput('file', '/o/first.pdf')
    for (let i = 0; i < 200; i += 1) registry.addOutput('file', `/o/${i}.pdf`)
    expect(registry.getOutput(first.id)).toBeUndefined()
  })
})
