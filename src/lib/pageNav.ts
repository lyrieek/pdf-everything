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
