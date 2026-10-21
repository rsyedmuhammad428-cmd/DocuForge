import { describe, expect, it } from 'vitest'
import { moveItem } from './list'

describe('moveItem', () => {
  it('moves items forwards and backwards', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
  })

  it('ignores moves outside the list and does not change the original', () => {
    const original = ['a', 'b']
    expect(moveItem(original, 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(original, -1, 0)).toEqual(['a', 'b'])
    expect(moveItem(original, 1, 1)).toEqual(['a', 'b'])
    expect(original).toEqual(['a', 'b'])
  })
})
