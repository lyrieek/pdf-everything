import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PdfViewer } from '../PdfViewer'
import { ThemeToggle } from '../ThemeToggle'
import { PropBtn } from '../PropBtn'
import { VirtualScrollbar } from '../VirtualScrollbar'
import { computeThumbMetrics, computeContentHeight, clampScrollTop } from '../../lib/pdfLayout'

// Mock pdfjs-dist：构造一个 5 页、每页 800x1000 的假文档
vi.mock('pdfjs-dist', () => {
  const makePage = () => ({
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
  })
  const doc = {
    numPages: 5,
    getPage: vi.fn(() => Promise.resolve(makePage())),
    getMetadata: vi.fn(() =>
      Promise.resolve({
        info: [
          { Title: 'Test PDF' },
          { Author: 'Test Author' },
          { Subject: 'Test Subject' },
          { Creator: 'Test Creator' },
          { Producer: 'Test Producer' },
          { CreationDate: 'D:20240101000000' },
          { ModDate: 'D:20240101000000' },
        ],
      }),
    ),
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({ promise: Promise.resolve(doc), destroy: vi.fn() })),
    TextLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), cancel: vi.fn() })),
    AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2, ENABLE_STORAGE: 3 },
    AnnotationLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), destroy: vi.fn() })),
    PDFWorker: vi.fn(() => ({ destroy: vi.fn() })),
  }
})

// Mock i18next：t 直接返回 key，便于断言
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: unknown }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

function dropPdf(container: Element) {
  const dropZone = container.querySelector('.pdf-container') as HTMLElement
  fireEvent.drop(dropZone, {
    dataTransfer: {
      files: [new File(['test'], 'test.pdf', { type: 'application/pdf' })],
    },
  })
}

describe('pdfLayout helpers', () => {
  it('computeContentHeight 是所有页面高度之和（含间距与内边距）', () => {
    expect(computeContentHeight([1000, 1000, 1000])).toBe(3000)
    expect(computeContentHeight([1000, 1000, 1000], { gap: 16 })).toBe(3000 + 32)
    expect(computeContentHeight([1000, 1000], { gap: 16, padding: 24 })).toBe(2000 + 16 + 48)
    expect(computeContentHeight([])).toBe(0)
  })

  it('clampScrollTop 限制在 [0, maxScrollTop]', () => {
    expect(clampScrollTop(-100, 500)).toBe(0)
    expect(clampScrollTop(200, 500)).toBe(200)
    expect(clampScrollTop(999, 500)).toBe(500)
    expect(clampScrollTop(999, 0)).toBe(0)
  })

  it('内容低于视口时不可滚动，滑块铺满轨道', () => {
    const m = computeThumbMetrics(500, 800, 0)
    expect(m.scrollable).toBe(false)
    expect(m.thumbHeight).toBe(800)
    expect(m.thumbTop).toBe(0)
    expect(m.maxScrollTop).toBe(0)
  })

  it('滑块高度与视口/内容比例一致，且不小于最小高度', () => {
    const m = computeThumbMetrics(5000, 800, 0)
    expect(m.scrollable).toBe(true)
    expect(m.thumbHeight).toBeCloseTo((800 / 5000) * 800)
    expect(m.maxScrollTop).toBe(4200)
    // 内容极长时滑块不小于最小高度
    const tiny = computeThumbMetrics(100000, 800, 0)
    expect(tiny.thumbHeight).toBe(96)
  })

  it('短轨道不会被最小滑块撑出边界', () => {
    const m = computeThumbMetrics(100000, 60, 500, 30)
    expect(m.thumbHeight).toBe(30)
    expect(m.thumbTop).toBe(0)
  })

  it('独立轨道高度不改变文档的最大滚动距离', () => {
    const m = computeThumbMetrics(5000, 800, 4200, 712)
    expect(m.maxScrollTop).toBe(4200)
    expect(m.thumbTop + m.thumbHeight).toBeCloseTo(712)
  })

  it('滑块位置随 scrollTop 线性移动，并在边界处收敛', () => {
    const top = computeThumbMetrics(5000, 800, 0)
    const mid = computeThumbMetrics(5000, 800, 2100)
    const bottom = computeThumbMetrics(5000, 800, 4200)
    expect(top.thumbTop).toBe(0)
    expect(mid.thumbTop).toBeCloseTo(0.5 * (800 - top.thumbHeight))
    expect(bottom.thumbTop).toBeCloseTo(800 - top.thumbHeight)
  })
})

describe('VirtualScrollbar', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    })
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  function pointer(target: Element, type: string, clientY: number) {
    fireEvent(target, new MouseEvent(type, { clientY, button: 0, bubbles: true }))
  }

  it('滑块高度/位置与几何计算一致', () => {
    const { container } = render(
      <VirtualScrollbar
        totalHeight={5000}
        viewportHeight={800}
        scrollTop={2100}
        onScroll={vi.fn()}
      />,
    )
    const thumb = container.querySelector('.virtual-scrollbar-thumb') as HTMLElement
    expect(thumb).not.toBeNull()
    const m = computeThumbMetrics(5000, 800, 2100, 712)
    expect(thumb).toHaveStyle(`height: ${m.thumbHeight}px`)
    expect(thumb).toHaveStyle(`top: ${m.thumbTop}px`)
  })

  it('内容不超过视口时不渲染滚动条', () => {
    const { container } = render(
      <VirtualScrollbar totalHeight={500} viewportHeight={800} scrollTop={0} onScroll={vi.fn()} />,
    )
    expect(container.querySelector('.virtual-scrollbar-track')).toBeNull()
  })

  it('多页即使完全容纳也显示导航区', () => {
    render(
      <VirtualScrollbar
        totalHeight={500}
        viewportHeight={800}
        scrollTop={0}
        pageCount={2}
        onScroll={vi.fn()}
      />,
    )
    expect(screen.getByRole('scrollbar')).toHaveAttribute('aria-disabled', 'true')
  })

  it('单页横向溢出时也显示导航区', () => {
    render(
      <VirtualScrollbar
        totalHeight={800}
        viewportHeight={800}
        scrollTop={0}
        hasOverflow
        onScroll={vi.fn()}
      />,
    )
    expect(screen.getByRole('scrollbar')).toBeInTheDocument()
  })

  it('拖动滑块触发 onScroll，且不超过最大滚动距离', () => {
    const onScroll = vi.fn()
    const { container } = render(
      <VirtualScrollbar
        totalHeight={5000}
        viewportHeight={800}
        scrollTop={0}
        onScroll={onScroll}
      />,
    )
    const thumb = container.querySelector('.virtual-scrollbar-thumb') as HTMLElement
    const track = screen.getByRole('scrollbar')
    pointer(thumb, 'pointerdown', 0)
    pointer(track, 'pointermove', 10_000)
    pointer(track, 'pointerup', 10_000)
    expect(onScroll).toHaveBeenCalled()
    const lastCall = onScroll.mock.calls.at(-1)?.[0] as number
    expect(lastCall).toBe(5000 - 800)
  })

  it('点击轨道将滑块中心移动到点击位置', () => {
    const onScroll = vi.fn()
    const { container } = render(
      <VirtualScrollbar
        totalHeight={5000}
        viewportHeight={800}
        scrollTop={0}
        onScroll={onScroll}
      />,
    )
    const track = container.querySelector('.virtual-scrollbar-track') as HTMLElement
    pointer(track, 'pointerdown', 356)
    expect(onScroll).toHaveBeenCalledWith(2100)
  })

  it('拖动完整滑块行程可以到达文档底部，松开后停止滚动', () => {
    const onScroll = vi.fn()
    const { container } = render(
      <VirtualScrollbar
        totalHeight={5000}
        viewportHeight={800}
        scrollTop={0}
        onScroll={onScroll}
      />,
    )
    const track = screen.getByRole('scrollbar')
    const thumb = container.querySelector('.virtual-scrollbar-thumb')!
    const { thumbHeight } = computeThumbMetrics(5000, 800, 0, 712)
    pointer(thumb, 'pointerdown', 50)
    pointer(track, 'pointermove', 50 + 712 - thumbHeight)
    expect(onScroll).toHaveBeenLastCalledWith(4200)
    pointer(track, 'pointerup', 700)
    onScroll.mockClear()
    pointer(track, 'pointermove', 200)
    expect(onScroll).not.toHaveBeenCalled()
  })

  it('键盘和滚轮均可导航，Ctrl 滚轮不移动位置', () => {
    const onScroll = vi.fn()
    render(
      <VirtualScrollbar
        totalHeight={5000}
        viewportHeight={800}
        scrollTop={100}
        onScroll={onScroll}
      />,
    )
    const track = screen.getByRole('scrollbar')
    fireEvent.keyDown(track, { key: 'End' })
    expect(onScroll).toHaveBeenLastCalledWith(4200)
    fireEvent.keyDown(track, { key: 'Home' })
    expect(onScroll).toHaveBeenLastCalledWith(0)
    fireEvent.wheel(track, { deltaY: 3, deltaMode: 1 })
    expect(onScroll).toHaveBeenLastCalledWith(148)
    onScroll.mockClear()
    fireEvent.wheel(track, { deltaY: 100, ctrlKey: true })
    expect(onScroll).not.toHaveBeenCalled()
  })
})

describe('PdfViewer 高度（不被截断）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('未加载时显示拖拽区', () => {
    render(<PdfViewer />)
    expect(screen.getByText('dropZone.title')).toBeInTheDocument()
    expect(screen.getByText('dropZone.hint')).toBeInTheDocument()
  })

  it('加载后渲染所有页面，且 pdf-pages 不设固定像素高度（height 为 auto，不裁剪 canvas）', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)

    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5)
    })

    const pdfPages = container.querySelector('.pdf-pages') as HTMLElement
    expect(pdfPages).not.toBeNull()
    // 关键回归：高度不能再被写死成某个小像素值（如 200px）而截断 canvas
    expect(pdfPages.style.height).toBe('')
    expect(pdfPages.getAttribute('style') ?? '').not.toMatch(/height\s*:\s*\d+px/)
    const pageWrapper = container.querySelector('.pdf-page-wrapper') as HTMLElement
    expect(pageWrapper).toHaveStyle('width: 800px')
    expect(pageWrapper.style.height).toBe('')
  })

  it('pdf-container 允许纵向滚动（内容可超出视口），原生滚动条被隐藏', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5)
    })
    // 容器不应裁剪内容：不能是 overflow:hidden
    const pdfContainer = container.querySelector('.pdf-container') as HTMLElement
    expect(pdfContainer).not.toBeNull()
    expect(window.getComputedStyle(pdfContainer).overflow).not.toBe('hidden')
  })
})

describe('ThemeToggle', () => {
  it('深色模式显示月亮图标，点击后切换为太阳图标', () => {
    const { container } = render(<ThemeToggle />)
    const button = container.querySelector('button') as HTMLElement
    // 初始（matchMedia 返回 false -> 非暗色）：太阳
    expect(button).not.toBeNull()
    fireEvent.click(button)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('PropBtn', () => {
  const mockPdfDoc = {
    numPages: 3,
    getMetadata: vi.fn(() => Promise.resolve({ info: [] })),
  } as never

  it('点击打开属性模态框，并显示传入的文件名', async () => {
    render(<PropBtn pdfDoc={mockPdfDoc} pages={[]} scale={1} fileName="custom-name.pdf" />)
    const button = screen.getByRole('button', { name: 'aria.properties' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByText('modal.title')).toBeInTheDocument()
    expect(screen.getByText('custom-name.pdf')).toBeInTheDocument()
  })

  it('点击关闭按钮关闭模态框', async () => {
    render(<PropBtn pdfDoc={mockPdfDoc} pages={[]} scale={1} fileName="a.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'aria.closeModal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('无 pdfDoc 时按钮禁用', () => {
    render(<PropBtn pdfDoc={null} pages={[]} scale={1} />)
    expect(screen.getByRole('button', { name: 'aria.properties' })).toBeDisabled()
  })
})

describe('PdfViewer 页面布局与 tooltip', () => {
  beforeEach(() => vi.clearAllMocks())

  async function load() {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5)
    })
    return container
  }

  it('默认单页布局，切换到双页后使用双页网格', async () => {
    const container = await load()
    expect(container.querySelector('.pdf-pages--double')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'toolbar.doublePage' }))
    await waitFor(() => {
      expect(container.querySelector('.pdf-pages--double')).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'toolbar.singlePage' }))
    await waitFor(() => {
      expect(container.querySelector('.pdf-pages--double')).toBeNull()
    })
  })

  it('未加载 PDF 时布局滑块禁用', () => {
    render(<PdfViewer />)
    expect(screen.getByRole('radio', { name: 'toolbar.singlePage' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'toolbar.doublePage' })).toBeDisabled()
  })

  it('仅有文本的按钮不包 tooltip，纯图标按钮都带 tooltip', () => {
    render(<PdfViewer />)

    expect(screen.getByRole('button', { name: 'aria.zoomOut' }).closest('.tooltip')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'aria.zoomIn' }).closest('.tooltip')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'aria.themeDark' }).closest('.tooltip'),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'aria.properties' }).closest('.tooltip'),
    ).not.toBeNull()
  })
})

describe('PdfViewer 语言切换', () => {
  it('渲染中英文滑块，且位于页面布局滑块之后', () => {
    render(<PdfViewer />)

    const pageLayout = screen.getByRole('radiogroup', { name: 'aria.pageLayout' })
    const language = screen.getByRole('radiogroup', { name: 'aria.language' })
    expect(language).toBeInTheDocument()
    expect(
      pageLayout.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('radio', { name: '中文' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
  })
})
