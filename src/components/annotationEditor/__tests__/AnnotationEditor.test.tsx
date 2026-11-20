import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, vi } from 'vitest'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { AnnotationEditor } from '../AnnotationEditor'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.page ? `${key}:${params.page}` : key,
    i18n: { language: 'en' },
  }),
}))

function makePage(annotations: unknown[]): PDFPageProxy {
  return {
    getAnnotations: vi.fn(async () => annotations),
  } as unknown as PDFPageProxy
}

const doc = { numPages: 2 } as unknown as PDFDocumentProxy
const file = new File([new Uint8Array(0)], 'test.pdf', { type: 'application/pdf' })

describe('AnnotationEditor', () => {
  it('没有注解时显示空状态', async () => {
    const page = makePage([])
    render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page]}
        currentPage={1}
        file={file}
        visible
        onClose={vi.fn()}
        onGotoPage={vi.fn()}
        onModified={vi.fn()}
      />,
    )

    expect(await screen.findByText('annotationEditor.empty')).toBeTruthy()
  })

  it('列出注解并展示类型、作者、页码', async () => {
    const page = makePage([
      {
        id: '1R',
        subtype: 'Highlight',
        contentsObj: { str: 'hello' },
        titleObj: { str: 'Alice' },
        creationDate: 'D:20240101000000',
      },
    ])

    render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page]}
        currentPage={1}
        file={file}
        visible
        onClose={vi.fn()}
        onGotoPage={vi.fn()}
        onModified={vi.fn()}
      />,
    )

    expect(await screen.findByText('hello')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('annotationEditor.page:1')).toBeTruthy()
  })

  it('点击当前页注解不触发跳转', async () => {
    const page = makePage([{ id: '1R', subtype: 'Text', contentsObj: { str: 'note' } }])
    const onGotoPage = vi.fn()

    render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page]}
        currentPage={1}
        file={file}
        visible
        onClose={vi.fn()}
        onGotoPage={onGotoPage}
        onModified={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByText('note'))
    expect(onGotoPage).not.toHaveBeenCalled()
  })

  it('全部页模式下点击其它页注解会跳转', async () => {
    const page1 = makePage([])
    const page2 = makePage([{ id: '2R', subtype: 'Text', contentsObj: { str: 'other page note' } }])
    const onGotoPage = vi.fn()

    render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page1, page2]}
        currentPage={1}
        file={file}
        visible
        onClose={vi.fn()}
        onGotoPage={onGotoPage}
        onModified={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('annotationEditor.allPages'))
    fireEvent.click(await screen.findByText('other page note'))
    expect(onGotoPage).toHaveBeenCalledWith(2)
  })

  it('点击关闭按钮触发 onClose', async () => {
    const page = makePage([])
    const onClose = vi.fn()

    render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page]}
        currentPage={1}
        file={file}
        visible
        onClose={onClose}
        onGotoPage={vi.fn()}
        onModified={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('annotationEditor.close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('作者与创建时间在同一行，双击作者复制完整名字', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const page = makePage([
      {
        id: '1R',
        subtype: 'Highlight',
        contentsObj: { str: 'hello' },
        titleObj: { str: 'Alice' },
        creationDate: 'D:20240101000000',
      },
    ])

    const { container } = render(
      <AnnotationEditor
        pdfDoc={doc}
        pages={[page]}
        currentPage={1}
        file={file}
        visible
        onClose={vi.fn()}
        onGotoPage={vi.fn()}
        onModified={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByLabelText('annotationEditor.expand'))

    const authorText = container.querySelector(
      '.annotation-editor-item__author-text',
    ) as HTMLElement | null
    expect(authorText).toBeTruthy()

    // 作者与创建时间位于同一行容器
    const metaRow = authorText!.closest('.annotation-editor-item__meta-fields')
    expect(metaRow).toBeTruthy()
    expect(metaRow!.contains(screen.getByText('annotationEditor.created'))).toBe(true)

    // 双击作者复制完整名字
    fireEvent.dblClick(authorText!)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Alice'))
  })
})
