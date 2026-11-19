import type { ComponentChildren } from 'preact'

import './Tooltip.css'

interface TooltipProps {
  /** 提示文案 */
  label: string
  /** 提示出现位置 */
  placement?: 'top' | 'bottom'
  /** 水平对齐方式，贴边按钮应使用 start/end 避免溢出容器 */
  align?: 'start' | 'center' | 'end'
  /** 长文本提示使用：换行显示并限制最大宽度 */
  wrap?: boolean
  /** 触发提示的元素（按钮等） */
  children: ComponentChildren
}

/** 纯 CSS 悬浮提示：鼠标悬停或键盘聚焦时显示 */
export function Tooltip({
  label,
  placement = 'bottom',
  align = 'center',
  wrap = false,
  children,
}: TooltipProps) {
  return (
    <span
      className={`tooltip tooltip--${placement} tooltip--align-${align}${wrap ? ' tooltip--wrap' : ''}`}
      data-tooltip={label}
    >
      {children}
    </span>
  )
}
