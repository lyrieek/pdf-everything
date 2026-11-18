import { describe, it, expect } from 'vitest'
import { PAGE_BATCH_SIZE, pageBatches } from '../pdfLoading'

describe('pageBatches', () => {
  it('按 PAGE_BATCH_SIZE 切分闭区间', () => {
    const batches = pageBatches(1, 50)
    expect(batches.length).toBe(Math.ceil(50 / PAGE_BATCH_SIZE))
    expect(batches[0][0]).toBe(1)
    // 所有页码连续且不重不漏
    expect(batches.flat()).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
  })

  it('支持自定义批大小', () => {
    expect(pageBatches(2, 6, 2)).toEqual([[2, 3], [4, 5], [6]])
    expect(pageBatches(1, 5, 10)).toEqual([[1, 2, 3, 4, 5]])
  })

  it('区间为空或反向时返回空数组', () => {
    expect(pageBatches(3, 2)).toEqual([])
    expect(pageBatches(2, 2, 0)).toEqual([[2]])
  })

  it('每批不超过批大小', () => {
    for (const batch of pageBatches(1, 100)) {
      expect(batch.length).toBeLessThanOrEqual(PAGE_BATCH_SIZE)
    }
  })
})
