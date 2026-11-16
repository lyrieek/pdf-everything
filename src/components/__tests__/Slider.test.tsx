import { render, screen, fireEvent } from '@testing-library/preact'
import { describe, it, expect, vi } from 'vitest'

import { Slider } from '../Slider'
import type { SliderOption } from '../Slider'

type DemoValue = 'a' | 'b'

const options: readonly SliderOption<DemoValue>[] = [
  {
    value: 'a',
    label: 'Option A',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="3" width="12" height="18" rx="2" />
      </svg>
    ),
  },
  {
    value: 'b',
    label: 'Option B',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="8" height="14" rx="1.5" />
        <rect x="13" y="5" width="8" height="14" rx="1.5" />
      </svg>
    ),
  },
]

describe('Slider', () => {
  it('渲染所有图标选项，并标记当前选中项', () => {
    render(<Slider value="a" options={options} onChange={vi.fn()} ariaLabel="demo" />)

    expect(screen.getByRole('radiogroup', { name: 'demo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Option A' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Option B' })).toHaveAttribute('aria-checked', 'false')
  })

  it('点击选项触发 onChange', () => {
    const onChange = vi.fn()
    render(<Slider value="a" options={options} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Option B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('方向键切换选项并聚焦新选项', () => {
    const onChange = vi.fn()
    render(<Slider value="a" options={options} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('b')

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('a')
  })

  it('禁用时选项不可用，且不响应键盘切换', () => {
    const onChange = vi.fn()
    render(<Slider value="a" options={options} onChange={onChange} disabled />)

    expect(screen.getByRole('radio', { name: 'Option A' })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
