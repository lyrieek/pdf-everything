import { render, fireEvent } from '@testing-library/preact'
import { useRef } from 'preact/hooks'
import { describe, it, expect, vi } from 'vitest'

import { getFocusable, useFocusTrap } from '../useFocusTrap'

/** 测试用模态框：触发按钮 + 模态框（两个可聚焦元素） */
function Dialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useFocusTrap({
    active: open,
    containerRef: modalRef,
    onEscape: () => onOpenChange(false),
    returnFocusRef: triggerRef,
  })

  return (
    <div>
      <button ref={triggerRef} onClick={() => onOpenChange(true)}>
        打开
      </button>
      {open && (
        <div ref={modalRef} className="modal" tabIndex={-1} role="dialog" aria-modal="true">
          <button className="first" onClick={() => onOpenChange(false)}>
            第一个
          </button>
          <button className="second" onClick={() => onOpenChange(false)}>
            第二个
          </button>
        </div>
      )}
    </div>
  )
}

function openDialog() {
  const onOpenChange = vi.fn((v: boolean) =>
    rerender(<Dialog open={v} onOpenChange={onOpenChange} />),
  )
  const rerender = (node: preact.ComponentChildren) => result.rerender(node)
  const result = render(<Dialog open={false} onOpenChange={onOpenChange} />)
  fireEvent.click(result.getByText('打开'))
  return { result, onOpenChange }
}

describe('useFocusTrap', () => {
  it('打开时焦点落在模态框内第一个可聚焦元素', () => {
    openDialog()
    const modal = document.querySelector('.modal') as HTMLElement
    expect(modal.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.className).toBe('first')
  })

  it('Tab 循环限制在模态框内', () => {
    openDialog()
    const seen: boolean[] = []
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' })
      const modal = document.querySelector('.modal') as HTMLElement
      seen.push(modal.contains(document.activeElement))
    }
    expect(seen.every(Boolean)).toBe(true)
  })

  it('Escape 关闭模态框', () => {
    const { result, onOpenChange } = openDialog()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // 模拟父组件把 open 置为 false 后的卸载
    result.rerender(<Dialog open={false} onOpenChange={onOpenChange} />)
    expect(document.querySelector('.modal')).toBeNull()
  })

  it('关闭后焦点还原到触发按钮', () => {
    const { result, onOpenChange } = openDialog()
    result.rerender(<Dialog open={false} onOpenChange={onOpenChange} />)
    expect(document.activeElement?.textContent).toBe('打开')
  })
})

describe('getFocusable', () => {
  it('排除 hidden 与 aria-hidden 的元素', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <button>a</button>
      <button hidden>b</button>
      <button aria-hidden="true">c</button>
      <button disabled>d</button>
    `
    const labels = getFocusable(container).map((el) => el.textContent)
    expect(labels).toEqual(['a'])
  })
})
