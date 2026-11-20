import { render, screen, fireEvent } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import { AnnotationItem } from '../AnnotationItem'
import type { AnnotationItemProps } from '../AnnotationItem'
import type { AnnotationListItem } from '../annotationTypes'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.page ? `${key}:${params.page}` : key,
    i18n: { language: 'en' },
  }),
}))

function makeItem(overrides: Partial<AnnotationListItem> = {}): AnnotationListItem {
  return {
    id: '1R',
    index: 0,
    pageIndex: 0,
    pageNumber: 1,
    subtype: 'Text',
    icon: 'Comment',
    contents: 'hello',
    author: 'Alice',
    creationDate: 'D:20240101000000',
    isEditable: true,
    ...overrides,
  }
}

function makeProps(
  item: AnnotationListItem,
  overrides: Partial<AnnotationItemProps> = {},
): AnnotationItemProps {
  return {
    item,
    selected: false,
    expanded: true,
    editing: false,
    readOnly: false,
    justChanged: false,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onEditStart: vi.fn(),
    onEditSave: vi.fn(),
    onEditCancel: vi.fn(),
    onRelocate: vi.fn(),
    onIconChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

describe('AnnotationItem', () => {
  it('Text 注解展示 10 个图标选项，点击后回调图标名', () => {
    const props = makeProps(makeItem())
    const { container } = render(<AnnotationItem {...props} />)

    const options = container.querySelectorAll('.annotation-editor-item__icon-option')
    expect(options).toHaveLength(10)
    expect(
      container
        .querySelector('.annotation-editor-item__icon-option.is-active')
        ?.getAttribute('title'),
    ).toBe('annotationEditor.iconComment')

    fireEvent.click(screen.getByRole('button', { name: 'annotationEditor.iconKey' }))
    expect(props.onIconChange).toHaveBeenCalledWith('Key')
  })

  it('非 Text 注解不展示图标选择器', () => {
    const { container } = render(
      <AnnotationItem {...makeProps(makeItem({ subtype: 'Highlight', icon: undefined }))} />,
    )
    expect(container.querySelector('.annotation-editor-item__icon-option')).toBeNull()
  })

  it('只读时禁用重新定位与删除', () => {
    render(<AnnotationItem {...makeProps(makeItem(), { readOnly: true })} />)

    expect(screen.getByRole('button', { name: 'annotationEditor.relocate' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'annotationEditor.delete' })).toBeDisabled()
  })

  it('刚修改过的条目标记 data-key 与高亮类', () => {
    const { container } = render(
      <AnnotationItem {...makeProps(makeItem(), { justChanged: true })} />,
    )
    const li = container.querySelector('.annotation-editor-item')
    expect(li?.getAttribute('data-annotation-key')).toBe('1R')
    expect(li?.classList.contains('is-just-changed')).toBe(true)
  })

  it('编辑态保存时读取当前输入值（不受父组件 props 刷新时机影响）', () => {
    const props = makeProps(makeItem(), { editing: true })
    const { container } = render(<AnnotationItem {...props} />)

    const textarea = container.querySelector(
      '.annotation-editor-item__edit-text',
    ) as HTMLTextAreaElement
    fireEvent.input(textarea, { target: { value: 'changed right before save' } })

    fireEvent.click(screen.getByRole('button', { name: 'annotationEditor.save' }))
    expect(props.onEditSave).toHaveBeenCalledWith(1, 0, 'changed right before save', 'Alice')
  })
})
