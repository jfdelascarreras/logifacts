import { describe, expect, it } from 'vitest'

import { parseUserProductForm } from '@/lib/products/user-product'

describe('parseUserProductForm', () => {
  it('accepts valid product input', () => {
    const result = parseUserProductForm({
      name: ' Small box ',
      weightLbs: '5',
      lengthIn: '10',
      widthIn: '8',
      heightIn: '4',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Small box',
        weightLbs: 5,
        lengthIn: 10,
        widthIn: 8,
        heightIn: 4,
      },
    })
  })

  it('rejects missing dimensions', () => {
    const result = parseUserProductForm({
      name: 'Partial',
      weightLbs: '5',
      lengthIn: '',
      widthIn: '8',
      heightIn: '4',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Length/)
  })

  it('rejects duplicate-length names over 80 chars', () => {
    const result = parseUserProductForm({
      name: 'x'.repeat(81),
      weightLbs: '1',
      lengthIn: '1',
      widthIn: '1',
      heightIn: '1',
    })
    expect(result.ok).toBe(false)
  })
})
