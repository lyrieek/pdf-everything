import { render, fireEvent, waitFor, screen, act } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as pdfjs from 'pdfjs-dist'

import { PdfViewer } from '../PdfViewer'

/** 测试用的加载任务：promise 可手动 resolve，用来控制加载阶段 */
interface MockTask {
  promise: Promise<unknown>
  destroy: ReturnType<typeof vi.fn>
  onProgress?: (progress: { loaded: number; total: number }) => void
  /** 测试钩子：手动让文档加载完成 */
  __resolve: (doc: unknown) => void
  /** 测试钩子：resolve 时使用的假文档 */
  __doc: unknown
}

// pdfjs mock：getViewport 支持 rotation（90/270 时宽高互换），getDocument 返回可手动 resolve 的任务
vi.mock('pdfjs-dist', () => {
  const makePage = () => ({
    getViewport: vi.fn(
      ({ scale = 1, rotation = 0 }: { scale?: number; rotation?: number } = {}) => {
        const swap = rotation % 180 !== 0
        return {
          width: (swap ? 1000 : 800) * scale,
          height: (swap ? 800 : 1000) * scale,
        }
      },
    ),
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
    numPages: 3,
    getPage: vi.fn(() => Promise.resolve(makePage())),
    getMetadata: vi.fn(() => Promise.resolve({ info: [] })),
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => {
      let resolve!: (doc: unknown) => void
      const promise = new Promise((res) => {
        resolve = res
      })
      return {
        promise,
        destroy: vi.fn(),
        onPassword: undefined,
        onProgress: undefined,
        __resolve: resolve,
        __doc: doc,
      }
    }),
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

function getDocumentMock(): { mock: { results: Array<{ value: MockTask }> } } {
  return pdfjs.getDocument as unknown as { mock: { results: Array<{ value: MockTask }> } }
}

function dropPdf(container: Element) {
  fireEvent.drop(container.querySelector('.pdf-container') as HTMLElement, {
    dataTransfer: { files: [new File(['%PDF-1.4 test'], 'test.pdf', { type: 'application/pdf' })] },
  })
}

/** 等待 getDocument 被调用后，返回该次加载任务 */
async function waitTask(): Promise<MockTask> {
  await waitFor(() => expect(getDocumentMock().mock.results.length).toBeGreaterThan(0))
  const results = getDocumentMock().mock.results
  return results[results.length - 1].value
}

describe('PDF 旋转', () => {
  beforeEach(() => vi.clearAllMocks())

  async function loadRotated() {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    const task = await waitTask()
    task.__resolve(task.__doc)
    await waitFor(() => expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(3))
    return container
  }

  const firstWrapperWidth = (container: Element) =>
    (container.querySelector('.pdf-page-wrapper') as HTMLElement).style.width

  it('默认无旋转，页面宽度为原始宽 800', async () => {
    const container = await loadRotated()
    expect(firstWrapperWidth(container)).toBe('800px')
  })

  it('向右旋转 90° 后宽高互换，wrapper 宽度变为 1000', async () => {
    const container = await loadRotated()
    fireEvent.click(screen.getByRole('button', { name: 'aria.rotateRight' }))
    await waitFor(() => expect(firstWrapperWidth(container)).toBe('1000px'))
  })

  it('向左旋转 90° 同样互换宽高', async () => {
    const container = await loadRotated()
    fireEvent.click(screen.getByRole('button', { name: 'aria.rotateLeft' }))
    await waitFor(() => expect(firstWrapperWidth(container)).toBe('1000px'))
  })

  it('连续旋转四次回到初始方向', async () => {
    const container = await loadRotated()
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'aria.rotateRight' }))
    }
    await waitFor(() => expect(firstWrapperWidth(container)).toBe('800px'))
  })

  it('未加载 PDF 时旋转按钮禁用', () => {
    render(<PdfViewer />)
    expect(screen.getByRole('button', { name: 'aria.rotateRight' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'aria.rotateLeft' })).toBeDisabled()
  })
})

describe('PDF 加载进度', () => {
  beforeEach(() => vi.clearAllMocks())

  it('下载阶段显示百分比（total > 0）', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    const task = await waitTask()
    act(() => task.onProgress?.({ loaded: 50, total: 200 }))
    await waitFor(() => expect(container.querySelector('.loading-value')?.textContent).toBe('25%'))
  })

  it('total 为 0（流式）时降级显示已加载字节数', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    const task = await waitTask()
    act(() => task.onProgress?.({ loaded: 2048, total: 0 }))
    await waitFor(() => expect(container.querySelector('.loading-value')?.textContent).toBe('2 KB'))
  })

  it('尚无进度回调时，加载遮罩存在但不渲染进度数值', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitTask()
    expect(container.querySelector('.loading')).not.toBeNull()
    expect(container.querySelector('.loading-value')).toBeNull()
  })
})
