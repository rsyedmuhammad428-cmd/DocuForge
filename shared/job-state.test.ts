import { describe, expect, it } from 'vitest'
import { assertTransition, canTransition, isFinished, type JobStatus } from './job-state'

const ALL: JobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled']

describe('job state machine', () => {
  it('allows the normal life cycle', () => {
    expect(canTransition('queued', 'running')).toBe(true)
    expect(canTransition('running', 'succeeded')).toBe(true)
    expect(canTransition('running', 'failed')).toBe(true)
    expect(canTransition('running', 'cancelled')).toBe(true)
    expect(canTransition('queued', 'cancelled')).toBe(true)
  })

  it('does not let a queued job finish without running', () => {
    expect(canTransition('queued', 'succeeded')).toBe(false)
    expect(canTransition('queued', 'failed')).toBe(false)
  })

  it('treats finished states as final', () => {
    for (const from of ['succeeded', 'failed', 'cancelled'] as const) {
      expect(isFinished(from)).toBe(true)
      for (const to of ALL) expect(canTransition(from, to)).toBe(false)
    }
    expect(isFinished('queued')).toBe(false)
    expect(isFinished('running')).toBe(false)
  })

  it('throws on a forbidden transition', () => {
    expect(() => assertTransition('succeeded', 'running')).toThrow(/cannot change/)
    expect(() => assertTransition('queued', 'running')).not.toThrow()
  })
})
