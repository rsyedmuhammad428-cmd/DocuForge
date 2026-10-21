import { describe, expect, it } from 'vitest'
import type { EngineOutcome, EngineRequest } from '../../shared/engine-protocol'
import type { EngineLauncher } from './engine-process'
import { FileRegistry } from './file-registry'
import { PdfQueryService, QueryError } from './pdf-service'

function service(respond: (request: EngineRequest) => EngineOutcome) {
  const requests: EngineRequest[] = []
  const launcher: EngineLauncher = (request) => {
    requests.push(request)
    return { cancel: () => undefined, outcome: Promise.resolve(respond(request)) }
  }
  const registry = new FileRegistry()
  return { requests, registry, queries: new PdfQueryService(registry, launcher) }
}

describe('PdfQueryService', () => {
  it('maps engine page counts and errors back to file ids', async () => {
    const { registry, queries, requests } = service(() => ({
      kind: 'result',
      data: {
        files: [
          { path: '/a.pdf', ok: true, pageCount: 12 },
          { path: '/b.pdf', ok: false, error: { code: 'PDF_ENCRYPTED', message: 'Locked.' } },
        ],
      },
    }))
    const a = registry.addInput('/a.pdf', 1)
    const b = registry.addInput('/b.pdf', 1)

    const results = await queries.inspect([a.id, 'forged-id', b.id])

    expect(requests[0]?.args).toEqual({ paths: ['/a.pdf', '/b.pdf'] })
    expect(results).toEqual([
      { fileId: a.id, ok: true, pageCount: 12, error: null },
      { fileId: b.id, ok: false, pageCount: null, error: { code: 'PDF_ENCRYPTED', message: 'Locked.' } },
    ])
  })

  it('does not start the engine when no file id is known', async () => {
    const { queries, requests } = service(() => ({ kind: 'result', data: {} }))
    expect(await queries.inspect(['forged'])).toEqual([])
    expect(requests).toHaveLength(0)
  })

  it('returns thumbnails and rejects unknown files', async () => {
    const thumb = { page: 0, width: 160, height: 200, dataUrl: 'data:image/jpeg;base64,AAAA' }
    const { registry, queries } = service(() => ({ kind: 'result', data: { thumbnails: [thumb] } }))
    const file = registry.addInput('/a.pdf', 1)

    expect(await queries.thumbnails(file.id, [0], 160)).toEqual([thumb])
    await expect(queries.thumbnails('forged', [0], 160)).rejects.toBeInstanceOf(QueryError)
  })

  it('rejects thumbnails whose data is not a JPEG data URL', async () => {
    const bad = { page: 0, width: 1, height: 1, dataUrl: 'https://evil.example/x.png' }
    const { registry, queries } = service(() => ({ kind: 'result', data: { thumbnails: [bad] } }))
    const file = registry.addInput('/a.pdf', 1)
    await expect(queries.thumbnails(file.id, [0], 160)).rejects.toThrow()
  })

  it('turns engine errors into user-facing errors', async () => {
    const { registry, queries } = service(() => ({ kind: 'error', code: 'PDF_CORRUPT', message: 'Damaged.' }))
    const file = registry.addInput('/a.pdf', 1)
    await expect(queries.thumbnails(file.id, [0], 160)).rejects.toMatchObject({
      code: 'PDF_CORRUPT',
      message: 'Damaged.',
    })
  })
})
