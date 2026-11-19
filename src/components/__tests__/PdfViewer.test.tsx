import { render, screen, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PdfViewer } from '../PdfViewer'
import { ThemeToggle } from '../ThemeToggle'
import { PropBtn } from '../PropBtn'
import { VirtualScrollbar } from '../VirtualScrollbar'
import {
  computeThumbMetrics,
  computeContentHeight,
  clampScrollTop,
  computeReferenceWidth,
  isOversizePage,
  oversizeMaxWidth,
} from '../../lib/pdfLayout'
import { formatPdfDate } from '../../lib/pdfDate'

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
        // pdf.js 的 info 是文档信息字典（普通对象），键为标准形式
        info: {
          Title: 'Test PDF',
          Author: 'Test Author',
          Subject: 'Test Subject',
          Creator: 'Test Creator',
          Producer: 'Test Producer',
          CreationDate: 'D:20240101000000',
          ModDate: 'D:20240101000000',
        },
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
    OPS: { setFont: 37 },
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

describe('pdfLayout 超大页 helpers', () => {
  it('computeReferenceWidth 取众数，空数组为 0，并列取先出现者', () => {
    expect(computeReferenceWidth([])).toBe(0)
    expect(computeReferenceWidth([652, 652, 879, 652])).toBe(652)
    // 并列（各 2 次）取先出现者
    expect(computeReferenceWidth([879, 652, 879, 652])).toBe(879)
    // 单数页
    expect(computeReferenceWidth([1000])).toBe(1000)
  })

  it('isOversizePage 与多数页宽相差 > 10% 即为超大页', () => {
    expect(isOversizePage(879, 652)).toBe(true) // +34.8%
    expect(isOversizePage(700, 652)).toBe(false) // +7.4%，未超阈值
    expect(isOversizePage(652, 652)).toBe(false)
    // 无基准时不判超大
    expect(isOversizePage(879, 0)).toBe(false)
  })

  it('oversizeMaxWidth 为两页宽 + 间距', () => {
    expect(oversizeMaxWidth(652)).toBe(652 * 2 + 16)
    expect(oversizeMaxWidth(800)).toBe(800 * 2 + 16)
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
    getMetadata: vi.fn(() => Promise.resolve({ info: {} })),
  } as never

  const pageAt = (width: number, height: number) =>
    ({ getViewport: vi.fn(() => ({ width, height })) }) as never

  it('点击打开属性模态框，并显示传入的文件名', async () => {
    render(<PropBtn pdfDoc={mockPdfDoc} pages={[]} fileName="custom-name.pdf" />)
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
    render(<PropBtn pdfDoc={mockPdfDoc} pages={[]} fileName="a.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'aria.closeModal' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('无 pdfDoc 时按钮禁用', () => {
    render(<PropBtn pdfDoc={null} pages={[]} />)
    expect(screen.getByRole('button', { name: 'aria.properties' })).toBeDisabled()
  })

  it('从 info 对象读取并展示作者、主题、创建/生成工具与日期', async () => {
    const doc = {
      numPages: 3,
      getMetadata: vi.fn(() =>
        Promise.resolve({
          info: {
            Title: 'Doc Title',
            Author: 'Ada Lovelace',
            Subject: 'Analytical Engine',
            Creator: 'Acme Creator',
            Producer: 'Acme Producer',
            CreationDate: 'D:20240101000000',
            ModDate: 'D:20240102000000',
          },
        }),
      ),
    } as never
    render(<PropBtn pdfDoc={doc} pages={[]} fileName="doc.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    })
    expect(screen.getByText('Analytical Engine')).toBeInTheDocument()
    expect(screen.getByText('Acme Creator')).toBeInTheDocument()
    expect(screen.getByText('Acme Producer')).toBeInTheDocument()
    // 日期按 PANEL_DATE_FORMAT + 当前语言（mock 为 en）格式化后展示，而非原始串
    expect(screen.getByText(formatPdfDate('D:20240101000000', 'en') as string)).toBeInTheDocument()
    expect(screen.getByText(formatPdfDate('D:20240102000000', 'en') as string)).toBeInTheDocument()
  })

  it('创建时间与修改时间相同时隐藏修改时间', async () => {
    const doc = {
      numPages: 3,
      getMetadata: vi.fn(() =>
        Promise.resolve({
          info: { CreationDate: 'D:20240101000000', ModDate: 'D:20240101000000' },
        }),
      ),
    } as never
    render(<PropBtn pdfDoc={doc} pages={[]} fileName="a.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.created')).toBeInTheDocument())
    expect(screen.queryByText('modal.modified')).not.toBeInTheDocument()
  })

  it('≤10 页且各页尺寸全等时显示「所有页尺寸」', async () => {
    const doc = { numPages: 3, getMetadata: vi.fn(() => Promise.resolve({ info: {} })) } as never
    const pages = [pageAt(595.28, 841.89), pageAt(595.28, 841.89), pageAt(595.28, 841.89)]
    render(<PropBtn pdfDoc={doc} pages={pages} fileName="a.pdf" currentPage={1} numPages={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.allPagesSize')).toBeInTheDocument())
    expect(screen.getByText('595 × 842 pt (A4)')).toBeInTheDocument()
  })

  it('各页尺寸不一致时显示当前页尺寸', async () => {
    const doc = { numPages: 3, getMetadata: vi.fn(() => Promise.resolve({ info: {} })) } as never
    const pages = [pageAt(595, 842), pageAt(800, 1000), pageAt(600, 900)]
    render(<PropBtn pdfDoc={doc} pages={pages} fileName="a.pdf" currentPage={2} numPages={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.currentPageSize')).toBeInTheDocument())
    expect(screen.getByText('800 × 1000 pt（modal.approx 282 × 353 mm）')).toBeInTheDocument()
  })

  it('显示 PDF 版本号（PDFFormatVersion）', async () => {
    const doc = {
      numPages: 3,
      getMetadata: vi.fn(() => Promise.resolve({ info: { PDFFormatVersion: '1.7' } })),
    } as never
    render(<PropBtn pdfDoc={doc} pages={[]} fileName="a.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.version')).toBeInTheDocument())
    expect(screen.getByText('1.7')).toBeInTheDocument()
  })

  it('创建时间与修改时间都缺失时隐藏修改时间', async () => {
    const doc = { numPages: 3, getMetadata: vi.fn(() => Promise.resolve({ info: {} })) } as never
    render(<PropBtn pdfDoc={doc} pages={[]} fileName="a.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.created')).toBeInTheDocument())
    expect(screen.queryByText('modal.modified')).not.toBeInTheDocument()
  })

  it('点击「计算所有页」：各页尺寸一致时替换为所有页尺寸', async () => {
    const page = pageAt(595.28, 841.89)
    const pages = Array.from({ length: 12 }, () => page)
    const doc = {
      numPages: 12,
      getMetadata: vi.fn(() => Promise.resolve({ info: {} })),
      getPage: vi.fn(() => Promise.resolve(page)),
    } as never
    render(<PropBtn pdfDoc={doc} pages={pages} fileName="a.pdf" currentPage={1} numPages={12} />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.currentPageSize')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'modal.computeAll' }))
    await waitFor(() => expect(screen.getByText('modal.allPagesSize')).toBeInTheDocument())
  })

  it('点击「计算所有页」：尺寸不一致时弹出明细窗口', async () => {
    const small = pageAt(595.28, 841.89)
    const large = pageAt(800, 1000)
    const pages = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? small : large))
    const doc = {
      numPages: 12,
      getMetadata: vi.fn(() => Promise.resolve({ info: {} })),
      getPage: vi.fn(() => Promise.resolve(small)),
    } as never
    render(<PropBtn pdfDoc={doc} pages={pages} fileName="a.pdf" currentPage={1} numPages={12} />)
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.currentPageSize')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'modal.computeAll' }))
    await waitFor(() => expect(screen.getByText('modal.pageSizes')).toBeInTheDocument())
    // 两种尺寸 → 明细里两条「第 N 页」
    expect(screen.getAllByText('modal.page')).toHaveLength(2)
  })

  it('所有页尺寸的值靠左布局（无按钮）', async () => {
    const page = pageAt(595.28, 841.89)
    const doc = { numPages: 2, getMetadata: vi.fn(() => Promise.resolve({ info: {} })) } as never
    const { container } = render(
      <PropBtn pdfDoc={doc} pages={[page, page]} fileName="a.pdf" currentPage={1} numPages={2} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    await waitFor(() => expect(screen.getByText('modal.allPagesSize')).toBeInTheDocument())
    expect(container.querySelector('.page-size-cell')).not.toBeNull()
    expect(container.querySelector('.page-size-cell--center')).toBeNull()
  })

  it('文档信息显示字体：最多 3 个，超过时弹出完整列表', async () => {
    const fontNames = ['Helvetica', 'Arial', 'Times New Roman', 'Courier']
    const page = {
      getViewport: vi.fn(() => ({ width: 595, height: 842 })),
      getOperatorList: vi.fn(() =>
        Promise.resolve({
          fnArray: fontNames.map(() => 37),
          argsArray: fontNames.map((_, i) => [`g_f${i}`, 12]),
        }),
      ),
      commonObjs: {
        get: (id: string) => {
          const name = fontNames[Number(id.replace('g_f', ''))]
          // Arial 有字体文件 → 嵌入；其余视为系统/标准字体
          return name === 'Arial'
            ? { loadedName: name, data: new Uint8Array([1]) }
            : { loadedName: name, missingFile: true }
        },
      },
    }
    const doc = {
      numPages: 1,
      getMetadata: vi.fn(() => Promise.resolve({ info: {} })),
      getPage: vi.fn(() => Promise.resolve(page)),
    } as never
    render(
      <PropBtn
        pdfDoc={doc}
        pages={[page as never]}
        fileName="a.pdf"
        currentPage={1}
        numPages={1}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'aria.properties' }))
    // 预览最多 3 个：第 4 个不出现
    await waitFor(() => expect(screen.getByText(/Helvetica/)).toBeInTheDocument())
    expect(screen.queryByText(/Courier/)).not.toBeInTheDocument()
    // 超过 3 个 → 「更多字体」按钮
    fireEvent.click(screen.getByRole('button', { name: 'modal.moreFonts' }))
    await waitFor(() => expect(screen.getByText('modal.fonts · 4')).toBeInTheDocument())
    expect(screen.getByText('Courier')).toBeInTheDocument()
    // 嵌入字体带「嵌入」标签（仅 Arial）
    expect(screen.getAllByText('modal.embedded')).toHaveLength(1)
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
