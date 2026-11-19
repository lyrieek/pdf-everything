/** 缩放范围与步长 */
export const MIN_SCALE = 0.5
export const MAX_SCALE = 3
/** 按住 Ctrl + 滚轮时的缩放步长 */
export const WHEEL_ZOOM_STEP = 0.1
/** 点击 +/- 按钮时的缩放步长 */
export const BUTTON_ZOOM_STEP = 0.25
/** 方向键一次滚动的像素 */
export const KEYBOARD_SCROLL_STEP = 80
/** Page Up/Down 滚动一屏的比例 */
export const PAGE_SCROLL_RATIO = 0.9

/** 页面旋转角度（顺时针，单位：度） */
export type Rotation = 0 | 90 | 180 | 270

/**
 * 在当前旋转角度上再旋转 `direction`（顺时针 90 或逆时针 90），
 * 结果归一化到 0 / 90 / 180 / 270。
 */
export function rotateBy(rotation: Rotation, direction: 90 | -90): Rotation {
  return ((((rotation + direction) % 360) + 360) % 360) as Rotation
}

/** 将缩放比例限制在允许范围内 */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE)
}

/** 在当前缩放基础上增减，并重新夹紧范围 */
export function stepZoom(scale: number, delta: number): number {
  return clampScale(scale + delta)
}

/**
 * 根据滚轮方向计算缩放后的比例。
 * deltaY < 0（向上滚）放大，deltaY > 0（向下滚）缩小。
 */
export function wheelZoomScale(scale: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0
  return clampScale(scale + direction * WHEEL_ZOOM_STEP)
}

/**
 * 根据按键返回滚动增量（像素）。
 * 未处理的按键返回 null。Home/End 用 ±Infinity 表示跳到底/顶，
 * 由调用方配合 clampScrollTop 处理。
 */
export function scrollStepForKey(key: string, viewportHeight: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return KEYBOARD_SCROLL_STEP
    case 'ArrowUp':
      return -KEYBOARD_SCROLL_STEP
    case 'PageDown':
      return Math.max(viewportHeight, 0) * PAGE_SCROLL_RATIO
    case 'PageUp':
      return -Math.max(viewportHeight, 0) * PAGE_SCROLL_RATIO
    case 'Home':
      return Number.NEGATIVE_INFINITY
    case 'End':
      return Number.POSITIVE_INFINITY
    default:
      return null
  }
}

/** 判断事件是否来自可编辑控件（输入框等），用于避免劫持键盘输入 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
