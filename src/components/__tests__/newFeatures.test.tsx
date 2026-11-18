import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PdfViewer } from '../PdfViewer'
import { pageAtScrollTop, scrollToPage, parsePageInput } from '../../lib/pageNav'
import { classifyError } from '../PdfViewer'

// 扩展 mock：6 页文档，每页 800x1000
vi.mock('pdfjs-dist', () => {
  const makePage = (w: number, h: number) => ({
    getViewport: vi.fn(() => ({ width: w, height: h })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    getAnnotations: vi.fn(() => Promise.resolve([])),
    streamTextContent: vi.fn(
      () =>
        new ReadableStream({
          start(c) {
            c.close()
          },
        }),
    ),
  })
  const doc = {
    numPages: 6,
    getPage: vi.fn(() => Promise.resolve(makePage(800, 1000))),
    getMetadata: vi.fn(() => Promise.resolve({ info: [] })),
    getOutline: vi.fn(() => Promise.resolve(null)),
    destroy: vi.fn(),
  }
  const loadingTask = {
    promise: Promise.resolve(doc),
    destroy: vi.fn(),
    onPassword: undefined,
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => loadingTask),
    TextLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), cancel: vi.fn() })),
    AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2, ENABLE_STORAGE: 3 },
    AnnotationLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), destroy: vi.fn() })),
    PDFWorker: vi.fn(() => ({ destroy: vi.fn() })),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: unknown }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

function dropPdf(container: Element) {
  fireEvent.drop(container.querySelector('.pdf-container') as HTMLElement, {
    dataTransfer: {
      files: [new File(['%PDF-1.4 test'], 'test.pdf', { type: 'application/pdf' })],
    },
  })
}

async function loadPdf() {
  const { container } = render(<PdfViewer />)
  dropPdf(container)
  await waitFor(() => {
    expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(6)
  })
  return container
}

describe('pageNav helpers', () => {
  it('scrollToPage 返回目标页顶部偏移', () => {
    expect(scrollToPage(1, [0, 1000, 2000])).toBe(0)
    expect(scrollToPage(3, [0, 1000, 2000])).toBe(2000)
    expect(scrollToPage(0, [0, 1000])).toBeNull()
    expect(scrollToPage(4, [0, 1000])).toBeNull()
  })

  it('pageAtScrollTop 反推当前页（1-based）', () => {
    const tops = [0, 1000, 2000, 3000]
    expect(pageAtScrollTop(0, tops)).toBe(1)
    expect(pageAtScrollTop(500, tops)).toBe(1)
    expect(pageAtScrollTop(1500, tops)).toBe(2)
    expect(pageAtScrollTop(5000, tops)).toBe(4)
  })

  it('parsePageInput 仅接受 1..maxPage 的整数', () => {
    expect(parsePageInput('1', 5)).toBe(1)
    expect(parsePageInput('5', 5)).toBe(5)
    expect(parsePageInput('0', 5)).toBeNull()
    expect(parsePageInput('6', 5)).toBeNull()
    expect(parsePageInput('abc', 5)).toBeNull()
  })
})

describe('PDFPage DPR 支持', () => {
  beforeEach(() => vi.clearAllMocks())

  it('canvas 宽高按 devicePixelRatio 放大', async () => {
    // 模拟 DPR=2
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const { PDFPage } = await import('../PDFPage')
    const page = {
      getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
      getAnnotations: vi.fn(() => Promise.resolve([])),
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      streamTextContent: vi.fn(
        () =>
          new ReadableStream({
            start(c) {
              c.close()
            },
          }),
      ),
    }
    const { container } = render(<PDFPage page={page as never} scale={1} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    // 物理像素 = CSS 像素 * DPR
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(2000)
    // CSS 尺寸仍为原始值
    expect(canvas.style.width).toBe('800px')
    expect(canvas.style.height).toBe('1000px')
  })
})

describe('PDFPage 文本层调用方式', () => {
  it('用 new 构造 TextLayer 并调用 render()（pdfjs v6 是 class）', async () => {
    const pdfjs = await import('pdfjs-dist')
    const layerMock = pdfjs.TextLayer as unknown as {
      mock: { calls: unknown[][]; results: { value: { render: ReturnType<typeof vi.fn> } }[] }
    }
    const { PDFPage } = await import('../PDFPage')
    const page = {
      getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
      getAnnotations: vi.fn(() => Promise.resolve([])),
      render: vi.fn(() => ({ promise: new Promise(() => {}), cancel: vi.fn() })),
      streamTextContent: vi.fn(
        () =>
          new ReadableStream({
            start(c) {
              c.close()
            },
          }),
      ),
    }

    render(<PDFPage page={page as never} scale={1} />)

    await vi.waitFor(() => expect(layerMock).toHaveBeenCalled())
    // 必须走 new 构造（而不是当普通函数调用），并调用实例的 render()
    const instance = layerMock.mock.results.at(-1)!.value
    expect(instance.render).toHaveBeenCalled()
    expect(page.streamTextContent).toHaveBeenCalled()
  })
})

describe('PDFPage 渲染取消', () => {
  it('切换 scale 时取消上一帧渲染', async () => {
    const cancelSpy = vi.fn()
    const page = {
      getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
      getAnnotations: vi.fn(() => Promise.resolve([])),
      render: vi.fn(() => ({ promise: new Promise(() => {}), cancel: cancelSpy })),
      streamTextContent: vi.fn(
        () =>
          new ReadableStream({
            start(c) {
              c.close()
            },
          }),
      ),
    }
    const { PDFPage } = await import('../PDFPage')
    const { rerender } = render(<PDFPage page={page as never} scale={1} />)
    await vi.waitFor(() => expect(page.render).toHaveBeenCalled())
    // 切换 scale 触发 cleanup（取消上一帧）
    rerender(<PDFPage page={page as never} scale={1.5} />)
    expect(cancelSpy).toHaveBeenCalled()
  })
})

describe('错误分类 classifyError', () => {
  it('PasswordException -> passwordRequired', () => {
    expect(classifyError({ name: 'PasswordException' })).toBe('error.passwordRequired')
  })
  it('InvalidPDFException -> invalidPdf', () => {
    expect(classifyError({ name: 'InvalidPDFException' })).toBe('error.invalidPdf')
  })
  it('未知错误 -> failedToLoad', () => {
    expect(classifyError(new Error('something else'))).toBe('error.failedToLoad')
    expect(classifyError(null)).toBe('error.failedToLoad')
  })
})

describe('PdfViewer 页面导航', () => {
  beforeEach(() => vi.clearAllMocks())

  it('显示上一页/下一页按钮', async () => {
    await loadPdf()
    expect(screen.getByRole('button', { name: '上一页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeInTheDocument()
    // 第 1 页时上一页禁用
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled()
  })

  it('点击下一页更新当前页', async () => {
    await loadPdf()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(screen.getByText('2 / 6')).toBeInTheDocument()
    })
  })

  it('点击上一页回到第 1 页', async () => {
    await loadPdf()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(screen.getByText('2 / 6')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    await waitFor(() => expect(screen.getByText('1 / 6')).toBeInTheDocument())
  })
})

describe('PdfViewer 重选文件', () => {
  beforeEach(() => vi.clearAllMocks())

  it('选择文件后清空 input.value，使重复选择同一文件仍会触发 change', async () => {
    const { container } = render(<PdfViewer />)
    const input = container.querySelector('#file-input') as HTMLInputElement
    expect(input).not.toBeNull()

    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4 test'], 'a.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(6)
    })
    // 关键回归：value 未清空时，浏览器不会为同一文件再次触发 change
    expect(input.value).toBe('')
  })
})

describe('PdfViewer 目录面板', () => {
  beforeEach(() => vi.clearAllMocks())

  it('有 pdfDoc 时显示目录切换按钮', async () => {
    await loadPdf()
    expect(screen.getByRole('button', { name: '目录' })).toBeInTheDocument()
  })

  it('点击目录按钮展开目录面板', async () => {
    await loadPdf()
    fireEvent.click(screen.getByRole('button', { name: '目录' }))
    await waitFor(() => {
      expect(document.querySelector('.outline-panel')).toBeInTheDocument()
    })
  })
})

describe('PdfViewer 文本层', () => {
  beforeEach(() => vi.clearAllMocks())

  it('每个渲染页面都创建 TextLayer 容器', async () => {
    await loadPdf()
    const textLayers = document.querySelectorAll('.pdf-page-canvas__text-layer')
    expect(textLayers.length).toBe(6)
  })
})
