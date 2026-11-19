/** 虚拟滚动条滑块的最小高度（px） */
export const MIN_THUMB_HEIGHT = 96

/** 超大页判定阈值：与多数页宽度相差超过该比例即视为超大页 */
export const OVERSIZE_RATIO = 0.1

/** 双页模式下列间距（与 app.css 的 column-gap 保持一致） */
export const DOUBLE_PAGE_GAP = 16

/**
 * 计算「多数页宽度」（众数）：在一组页面宽度里找出现次数最多者。
 *
 * - 空数组返回 0；
 * - 并列时取先出现者（保持确定性，避免渲染抖动）。
 *
 * 用于双页模式下判定超大页：以大多数页的宽度为基准。
 */
export function computeReferenceWidth(widths: number[]): number {
  if (widths.length === 0) return 0
  const counts = new Map<number, number>()
  let best = Math.round(widths[0])
  let bestCount = 0
  for (const raw of widths) {
    const w = Math.round(raw)
    const c = (counts.get(w) ?? 0) + 1
    counts.set(w, c)
    if (c > bestCount) {
      bestCount = c
      best = w
    }
  }
  return best
}

/**
 * 是否为「超大页」：与多数页宽度相差超过 `ratio`。
 *
 * `referenceWidth <= 0`（尚无基准）时一律返回 false。
 */
export function isOversizePage(
  width: number,
  referenceWidth: number,
  ratio: number = OVERSIZE_RATIO,
): boolean {
  if (referenceWidth <= 0) return false
  return Math.abs(width - referenceWidth) / referenceWidth > ratio
}

/**
 * 超大页在双页模式下的最大显示宽度：两页宽 + 间距。
 *
 * 保证一张超大页最多占「两页」的横向空间，不会把整体撑得比正常双页更宽。
 */
export function oversizeMaxWidth(referenceWidth: number): number {
  return referenceWidth * 2 + DOUBLE_PAGE_GAP
}

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
