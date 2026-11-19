/** 页面导航相关纯函数 */

/**
 * 根据页码和目标 PDF 容器滚动位置计算滚动偏移。
 * 返回目标 scrollTop（由调用方 clampScrollTop 处理边界）。
 */
export function scrollToPage(pageNumber: number, pageTops: number[]): number | null {
  if (pageNumber < 1 || pageNumber > pageTops.length) return null
  return pageTops[pageNumber - 1]
}

/**
 * 根据当前 scrollTop 反推当前页（1-based）。
 * pageTops 为各页顶部偏移，按升序排列。
 */
export function pageAtScrollTop(scrollTop: number, pageTops: number[]): number {
  if (pageTops.length === 0) return 1
  let page = 1
  for (let i = 0; i < pageTops.length; i++) {
    if (scrollTop >= pageTops[i]) page = i + 1
    else break
  }
  return page
}

/** 页码跳转输入框的校验：仅允许 1..maxPage 的整数 */
export function parsePageInput(value: string, maxPage: number): number | null {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 1 || n > maxPage) return null
  return n
}

/** 当前页判定：页面在视口中露出自身该比例以上即视为候选 */
export const CURRENT_PAGE_ENTER_RATIO = 0.45

/** 当前页判定迟滞：已候选的页低于该比例才移出，避免 45% 边界抖动 */
export const CURRENT_PAGE_EXIT_RATIO = 0.4

/**
 * 从「视口中可见比例达标」的页集合里取当前页：页码最小者。
 *
 * 集合为空（页间空隙、超高页等）时保留 `fallback`，避免页码跳回。
 */
export function minVisiblePage(pages: Iterable<number>, fallback: number): number {
  let min = Number.POSITIVE_INFINITY
  for (const page of pages) {
    if (page < min) min = page
  }
  return Number.isFinite(min) ? min : fallback
}
