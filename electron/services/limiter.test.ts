import { describe, expect, it } from 'vitest'
import { createLimiter } from './limiter'

describe('createLimiter', () => {
  it('never runs more than the limit at once and keeps order', async () => {
    const run = createLimiter(2)
    let active = 0
    let peak = 0
    const started: number[] = []

    const task = (id: number) =>
      run(async () => {
        started.push(id)
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return id
      })

    const results = await Promise.all([1, 2, 3, 4, 5].map(task))
    expect(results).toEqual([1, 2, 3, 4, 5])
    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
  })

  it('keeps going after a task fails', async () => {
    const run = createLimiter(1)
    await expect(run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(run(() => Promise.resolve('fine'))).resolves.toBe('fine')
  })
})
