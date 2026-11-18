import { useEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

/** 可被 Tab 聚焦的元素选择器 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** 取出容器内当前可聚焦的元素（按 DOM 顺序） */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  )
}

export interface FocusTrapOptions {
  /** 是否启用（模态框打开时传 true） */
  active: boolean
  /** 模态容器 */
  containerRef: RefObject<HTMLElement | null>
  /** 按下 Escape 时的回调（通常是关闭） */
  onEscape?: () => void
  /**
   * 关闭后焦点还原目标（通常是打开模态框的那个按钮）。
   * 缺省回退到打开前的 `document.activeElement`。
   */
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * 模态框焦点管理：Tab 循环限制在容器内 + Escape 关闭 + 关闭后还原焦点。
 *
 * 键盘监听挂在 `document` 的捕获阶段，保证焦点逃出容器（点击背景等）后
 * 按 Tab 仍会被拉回容器内。
 */
export function useFocusTrap({
  active,
  containerRef,
  onEscape,
  returnFocusRef,
}: FocusTrapOptions): void {
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusFirst = () => {
      const items = getFocusable(container)
      ;(items[0] ?? container).focus({ preventScroll: true })
    }
    focusFirst()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        escapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return

      const items = getFocusable(container)
      if (items.length === 0) {
        e.preventDefault()
        container.focus({ preventScroll: true })
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement as HTMLElement | null
      const inside = current ? container.contains(current) : false

      if (!e.shiftKey && (!inside || current === last)) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      } else if (e.shiftKey && (!inside || current === first)) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)

      const target = returnFocusRef?.current ?? previouslyFocused
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true })
      }
    }
  }, [active, containerRef, returnFocusRef])
}
