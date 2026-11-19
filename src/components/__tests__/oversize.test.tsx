import { render, fireEvent, waitFor } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PdfViewer } from '../PdfViewer'

/**
 * 5 页文档：多数页 800 宽，第 3 页 2000 宽（远超「两页宽」= 1616）。
 * 用于验证双页模式下超大页：独占一行（is-oversize）、加徽标、超宽被夹到两页宽。
 */
vi.mock('pdfjs-dist', () => {
  const widths = [800, 800, 2000, 800, 800]
  const makePage = (w: number) => ({
    getViewport: vi.fn(() => ({ width: w, height: 1000 })),
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
    numPages: widths.length,
    getPage: vi.fn((n: number) => Promise.resolve(makePage(widths[n - 1] ?? 800))),
    getMetadata: vi.fn(() => Promise.resolve({ info: [] })),
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
    dataTransfer: { files: [new File(['%PDF-1.4 test'], 'test.pdf', { type: 'application/pdf' })] },
  })
}

async function loadDouble() {
  const { container } = render(<PdfViewer />)
  dropPdf(container)
  await waitFor(() => expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5))
  fireEvent.click(
    document.querySelector('[role="radio"][aria-label="toolbar.doublePage"]') as Element,
  )
  await waitFor(() => expect(container.querySelector('.pdf-pages--double')).not.toBeNull())
  return container
}

describe('双页模式超大页', () => {
  beforeEach(() => vi.clearAllMocks())

  it('超宽页加 is-oversize 类与徽标，并夹到两页宽度（≤ 2*多数页宽 + 间距）', async () => {
    const container = await loadDouble()
    const wraps = [...container.querySelectorAll('.pdf-page-wrapper')]
    const oversize = wraps[2] as HTMLElement // 第 3 页（2000 宽）

    expect(oversize.classList.contains('is-oversize')).toBe(true)
    expect(oversize.querySelector('.oversize-badge')).not.toBeNull()
    // 2000 > 1616，被夹到 1616
    expect(oversize.style.width).toBe('1616px')
  })

  it('多数页不加 is-oversize、无徽标', async () => {
    const container = await loadDouble()
    const wraps = [...container.querySelectorAll('.pdf-page-wrapper')]
    for (const i of [0, 1, 3, 4]) {
      const el = wraps[i] as HTMLElement
      expect(el.classList.contains('is-oversize')).toBe(false)
      expect(el.querySelector('.oversize-badge')).toBeNull()
    }
  })

  it('单页模式下不标记超大页', async () => {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitFor(() => expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5))
    // 默认单页
    const wraps = [...container.querySelectorAll('.pdf-page-wrapper')]
    expect(wraps[2].classList.contains('is-oversize')).toBe(false)
  })
})
