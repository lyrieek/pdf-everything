import type { ComponentChildren } from 'preact'

import { Tooltip } from './Tooltip'
import './Slider.css'

export interface SliderOption<T extends string> {
  /** 选项值 */
  value: T
  /** 选项图标（SVG） */
  icon: ComponentChildren
  /** 无障碍标签与 tooltip 文案 */
  label: string
}

interface SliderProps<T extends string> {
  /** 当前选中值 */
  value: T
  /** 选项列表 */
  options: readonly SliderOption<T>[]
  /** 选中变化回调 */
  onChange: (value: T) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 整体无障碍标签 */
  ariaLabel?: string
}

/** 滑块式分段选择器：滑块在多个图标选项间滑动 */
export function Slider<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: SliderProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || options.length < 2) return

    let nextIndex = activeIndex
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (activeIndex + 1) % options.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (activeIndex - 1 + options.length) % options.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = options.length - 1
        break
      default:
        return
    }

    e.preventDefault()
    onChange(options[nextIndex].value)
    const buttons = (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>(
      '.slider-option',
    )
    buttons[nextIndex]?.focus()
  }

  const thumbStyle = {
    width: `calc((100% - 4px) / ${options.length})`,
    transform: `translateX(${activeIndex * 100}%)`,
  }

  return (
    <div
      className={`slider${disabled ? ' is-disabled' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
    >
      <span className="slider-thumb" style={thumbStyle} aria-hidden="true" />
      {options.map((option, index) => {
        const selected = option.value === value
        // 首尾选项向内展开提示，避免在容器边缘产生溢出
        const align =
          options.length === 1
            ? 'center'
            : index === 0
              ? 'start'
              : index === options.length - 1
                ? 'end'
                : 'center'
        return (
          <Tooltip key={option.value} label={option.label} align={align}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              className={`slider-option${selected ? ' is-active' : ''}`}
              onClick={() => onChange(option.value)}
              disabled={disabled}
            >
              {option.icon}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
