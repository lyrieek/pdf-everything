/**
 * PDF 页面加载辅助
 */

/**
 * 每批获取的页数。
 *
 * 上千页的文档如果一次性 `doc.getPage(1..N)` 会同时发起上千个 worker 请求，
 * 内存与首屏都吃不消。分批后每批只保持少量并发请求。
 */
export const PAGE_BATCH_SIZE = 24

/**
 * 把闭区间 `[from, to]` 的页码按 `size` 切成若干批。
 *
 * 返回的是 1-based 页码数组，例如 `pageBatches(2, 6, 2)` → `[[2, 3], [4, 5], [6]]`。
 * `to < from` 时返回空数组（调用方无需特判）。
 */
export function pageBatches(from: number, to: number, size: number = PAGE_BATCH_SIZE): number[][] {
  const step = Math.max(1, Math.floor(size))
  const start = Math.max(1, Math.floor(from))
  const end = Math.floor(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []

  const batches: number[][] = []
  for (let page = start; page <= end; page += step) {
    const batch: number[] = []
    for (let n = page; n <= end && n < page + step; n++) batch.push(n)
    batches.push(batch)
  }
  return batches
}
