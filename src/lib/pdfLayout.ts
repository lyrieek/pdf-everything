/** 虚拟滚动条滑块的最小高度（px） */
export const MIN_THUMB_HEIGHT = 96

/** 滚动位置与滑块的几何计算结果 */
export interface ThumbMetrics {
  /** 滑块高度 */
  thumbHeight: number
  /** 滑块顶部偏移 */
  thumbTop: number
  /** 可滚动最大距离 */
  maxScrollTop: number
  /** 内容是否超出视口（需要滚动） */
  scrollable: boolean
}

/**
 * 计算虚拟滚动条的滑块几何。
 *
 * 关键约束：当内容高度小于等于视口高度时不可滚动，
 * 此时滑块铺满整条轨道，`scrollable` 为 false。
 */
export function computeThumbMetrics(
  totalHeight: number,
  viewportHeight: number,
  scrollTop: number,
  trackHeight = viewportHeight,
): ThumbMetrics {
  const safeTotal = Math.max(totalHeight, 0)
  const safeViewport = Math.max(viewportHeight, 0)
  const safeTrack = Math.max(trackHeight, 0)
  const maxScrollTop = Math.max(safeTotal - safeViewport, 0)
  const scrollable = maxScrollTop > 0

  if (!scrollable || safeTotal <= 0) {
    return {
      thumbHeight: safeTrack,
      thumbTop: 0,
      maxScrollTop: 0,
      scrollable: false,
    }
  }

  const ratio = safeViewport / safeTotal
  const thumbHeight = Math.min(Math.max(ratio * safeTrack, MIN_THUMB_HEIGHT), safeTrack)
  const trackRange = Math.max(safeTrack - thumbHeight, 0)
  const progress = clampScrollTop(scrollTop, maxScrollTop) / maxScrollTop
  const thumbTop = progress * trackRange

  return { thumbHeight, thumbTop, maxScrollTop, scrollable }
}

/** 将滚动位置限制在 [0, maxScrollTop] 范围内 */
export function clampScrollTop(scrollTop: number, maxScrollTop: number): number {
  if (maxScrollTop <= 0) return 0
  return Math.min(Math.max(scrollTop, 0), maxScrollTop)
}

/**
 * 根据各页面的高度计算内容总高度。
 *
 * 页面容器的高度必须等于所有页面高度之和（含间距），
 * 否则 canvas 会被容器裁剪。
 */
export function computeContentHeight(
  pageHeights: number[],
  options: { gap?: number; padding?: number } = {},
): number {
  const { gap = 0, padding = 0 } = options
  const pagesTotal = pageHeights.reduce((sum, h) => sum + Math.max(h, 0), 0)
  const gapsTotal = gap * Math.max(pageHeights.length - 1, 0)
  return pagesTotal + gapsTotal + padding * 2
}
