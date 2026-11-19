import { describe, it, expect } from 'vitest'

import {
  formatMm,
  formatPageSize,
  formatPageSizeBoth,
  formatPt,
  groupPageSizes,
  isSameSize,
  matchStandardSize,
} from '../pageSize'

describe('matchStandardSize', () => {
  it('识别 A 系列（含横向）', () => {
    expect(matchStandardSize({ width: 841.89, height: 1190.55 })).toBe('A3')
    expect(matchStandardSize({ width: 595.28, height: 841.89 })).toBe('A4')
    expect(matchStandardSize({ width: 841.89, height: 595.28 })).toBe('A4')
    expect(matchStandardSize({ width: 419.53, height: 595.28 })).toBe('A5')
    expect(matchStandardSize({ width: 396.85, height: 595.28 })).toBe('PA5')
  })

  it('识别 B 系列', () => {
    expect(matchStandardSize({ width: 728.5, height: 1031.8 })).toBe('B4')
    expect(matchStandardSize({ width: 515.9, height: 728.5 })).toBe('B5')
  })

  it('识别 Letter / Legal', () => {
    expect(matchStandardSize({ width: 612, height: 792 })).toBe('Letter')
    expect(matchStandardSize({ width: 792, height: 612 })).toBe('Letter')
    expect(matchStandardSize({ width: 612, height: 1008 })).toBe('Legal')
  })

  it('非标准尺寸返回 null', () => {
    expect(matchStandardSize({ width: 800, height: 1000 })).toBeNull()
  })
})

describe('formatPt / formatMm', () => {
  it('pt 四舍五入到整数', () => {
    expect(formatPt({ width: 595.28, height: 841.89 })).toBe('595 × 842 pt')
  })

  it('mm 由 pt 换算（1pt = 25.4/72 mm）', () => {
    expect(formatMm({ width: 595.28, height: 841.89 })).toBe('210 × 297 mm')
    expect(formatMm({ width: 800, height: 1000 })).toBe('282 × 353 mm')
  })
})

describe('formatPageSize', () => {
  it('标准尺寸只显示 pt + 标签', () => {
    expect(formatPageSize({ width: 595.28, height: 841.89 }, '约')).toBe('595 × 842 pt (A4)')
    expect(formatPageSize({ width: 841.89, height: 595.28 }, '约')).toBe('842 × 595 pt (A4)')
    expect(formatPageSize({ width: 612, height: 792 }, '约')).toBe('612 × 792 pt (Letter)')
  })

  it('非标准尺寸带 approxLabel 时双单位、用本地化词分隔', () => {
    expect(formatPageSize({ width: 800, height: 1000 }, '约')).toBe(
      '800 × 1000 pt（约 282 × 353 mm）',
    )
    expect(formatPageSize({ width: 800, height: 1000 }, 'approx.')).toBe(
      '800 × 1000 pt（approx. 282 × 353 mm）',
    )
  })

  it('非标准尺寸无 approxLabel 时用 / 分隔', () => {
    expect(formatPageSize({ width: 800, height: 1000 })).toBe('800 × 1000 pt / 282 × 353 mm')
  })
})

describe('formatPageSizeBoth', () => {
  it('始终双单位，标准尺寸带标签', () => {
    expect(formatPageSizeBoth({ width: 595.28, height: 841.89 }, '约')).toBe(
      '595 × 842 pt (A4)（约 210 × 297 mm）',
    )
    expect(formatPageSizeBoth({ width: 800, height: 1000 }, '约')).toBe(
      '800 × 1000 pt（约 282 × 353 mm）',
    )
  })
})

describe('isSameSize', () => {
  it('容差内视为相同', () => {
    expect(isSameSize({ width: 595, height: 842 }, { width: 595.4, height: 841.6 })).toBe(true)
  })

  it('超出容差视为不同', () => {
    expect(isSameSize({ width: 595, height: 842 }, { width: 600, height: 842 })).toBe(false)
  })
})

describe('groupPageSizes', () => {
  it('全部一致时 allSame=true 且只有一组', () => {
    const result = groupPageSizes([
      { page: 1, size: { width: 595, height: 842 } },
      { page: 2, size: { width: 595.4, height: 841.6 } },
    ])
    expect(result.allSame).toBe(true)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].page).toBe(1)
  })

  it('不一致时 allSame=false，每种尺寸保留一个代表页', () => {
    const result = groupPageSizes([
      { page: 1, size: { width: 595, height: 842 } },
      { page: 2, size: { width: 595.4, height: 841.6 } },
      { page: 3, size: { width: 800, height: 1000 } },
      { page: 4, size: { width: 800, height: 1000 } },
    ])
    expect(result.allSame).toBe(false)
    expect(result.groups).toEqual([
      { size: { width: 595, height: 842 }, page: 1 },
      { size: { width: 800, height: 1000 }, page: 3 },
    ])
  })

  it('最多返回 10 种尺寸', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      page: i + 1,
      size: { width: 500 + i * 10, height: 700 + i * 10 },
    }))
    expect(groupPageSizes(entries).groups).toHaveLength(10)
  })
})
