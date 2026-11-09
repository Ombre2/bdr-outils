import { describe, expect, it } from 'vitest'
import { paginate } from '@/components/Pagination'

const items = Array.from({ length: 120 }, (_, i) => i + 1)

describe('paginate', () => {
  it('découpe la première page', () => {
    const p = paginate(items, 1, 50)
    expect(p.items).toHaveLength(50)
    expect(p.items[0]).toBe(1)
    expect(p.pageCount).toBe(3)
    expect(p.from).toBe(1)
    expect(p.to).toBe(50)
  })

  it('la dernière page est incomplète', () => {
    const p = paginate(items, 3, 50)
    expect(p.items).toHaveLength(20)
    expect(p.from).toBe(101)
    expect(p.to).toBe(120)
  })

  it('borne une page hors plage à la dernière page', () => {
    const p = paginate(items, 99, 50)
    expect(p.page).toBe(3)
    expect(p.items[0]).toBe(101)
  })

  it('gère une liste vide', () => {
    const p = paginate([] as number[], 1, 50)
    expect(p.pageCount).toBe(1)
    expect(p.items).toHaveLength(0)
    expect(p.from).toBe(0)
    expect(p.to).toBe(0)
  })
})
