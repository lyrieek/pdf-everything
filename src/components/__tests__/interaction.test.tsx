import { render, fireEvent, waitFor, screen } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PdfViewer } from '../PdfViewer'
import {
  BUTTON_ZOOM_STEP,
  KEYBOARD_SCROLL_STEP,
  MAX_SCALE,
  MIN_SCALE,
  PAGE_SCROLL_RATIO,
  clampScale,
  isEditableTarget,
  scrollStepForKey,
  stepZoom,
  wheelZoomScale,
} from '../../lib/interaction'

// 复用与主测试相同的 pdfjs mock（5 页，每页 800x1000）
vi.mock('pdfjs-dist', () => {
  const makePage = () => ({
    getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  })
  const doc = {
    numPages: 5,
    getPage: vi.fn(() => Promise.resolve(makePage())),
    getMetadata: vi.fn(() => Promise.resolve({ info: [] })),
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({ promise: Promise.resolve(doc) })),
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
    dataTransfer: { files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] },
  })
}

describe('interaction helpers', () => {
  it('clampScale 限制在 [MIN_SCALE, MAX_SCALE]', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE)
  })

  it('stepZoom 增减并夹紧', () => {
    expect(stepZoom(1, BUTTON_ZOOM_STEP)).toBe(1.25)
    expect(stepZoom(MIN_SCALE, -1)).toBe(MIN_SCALE)
    expect(stepZoom(MAX_SCALE, 1)).toBe(MAX_SCALE)
  })

  it('wheelZoomScale：上滚放大、下滚缩小、无滚动不变', () => {
    expect(wheelZoomScale(1, -120)).toBeCloseTo(1.1)
    expect(wheelZoomScale(1, 120)).toBeCloseTo(0.9)
    expect(wheelZoomScale(1, 0)).toBe(1)
    // 边界夹紧
    expect(wheelZoomScale(MIN_SCALE, 120)).toBe(MIN_SCALE)
    expect(wheelZoomScale(MAX_SCALE, -120)).toBe(MAX_SCALE)
  })

  it('scrollStepForKey 映射方向键与翻页键', () => {
    expect(scrollStepForKey('ArrowDown', 800)).toBe(KEYBOARD_SCROLL_STEP)
    expect(scrollStepForKey('ArrowUp', 800)).toBe(-KEYBOARD_SCROLL_STEP)
    expect(scrollStepForKey('PageDown', 800)).toBeCloseTo(800 * PAGE_SCROLL_RATIO)
    expect(scrollStepForKey('PageUp', 800)).toBeCloseTo(-800 * PAGE_SCROLL_RATIO)
    expect(scrollStepForKey('Home', 800)).toBe(Number.NEGATIVE_INFINITY)
    expect(scrollStepForKey('End', 800)).toBe(Number.POSITIVE_INFINITY)
    expect(scrollStepForKey('a', 800)).toBeNull()
  })

  it('isEditableTarget 识别输入控件', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('PdfViewer 键盘导航', () => {
  let scrollToSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollToSpy = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollTo', {
      writable: true,
      configurable: true,
      value: scrollToSpy,
    })
  })

  async function loadAndPrepare() {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitFor(() => {
      expect(container.querySelectorAll('.pdf-page-wrapper').length).toBe(5)
    })
    const pdfContainer = container.querySelector('.pdf-container') as HTMLElement
    // jsdom 不计算布局，手动给出滚动几何
    Object.defineProperty(pdfContainer, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(pdfContainer, 'scrollHeight', { configurable: true, value: 5000 })
    Object.defineProperty(pdfContainer, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    })
    return { container, pdfContainer }
  }

  it('ArrowDown 向下滚动一个步长', async () => {
    await loadAndPrepare()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(scrollToSpy).toHaveBeenCalled()
    const arg = scrollToSpy.mock.calls.at(-1)?.[0] as { top: number }
    expect(arg.top).toBe(KEYBOARD_SCROLL_STEP)
  })

  it('End 跳到内容底部，Home 回到顶部', async () => {
    const { pdfContainer } = await loadAndPrepare()
    fireEvent.keyDown(window, { key: 'End' })
    expect((scrollToSpy.mock.calls.at(-1)?.[0] as { top: number }).top).toBe(5000 - 800)

    pdfContainer.scrollTop = 4200
    fireEvent.keyDown(window, { key: 'Home' })
    expect((scrollToSpy.mock.calls.at(-1)?.[0] as { top: number }).top).toBe(0)
  })

  it('未加载 PDF 时按键不触发滚动', () => {
    render(<PdfViewer />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('焦点在输入框时不劫持按键', async () => {
    await loadAndPrepare()
    const input = screen.getByLabelText('toolbar.zoomLevel')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(scrollToSpy).not.toHaveBeenCalled()
  })
})

describe('PdfViewer Ctrl+滚轮缩放', () => {
  async function load() {
    const { container } = render(<PdfViewer />)
    dropPdf(container)
    await waitFor(() => {
      expect((screen.getByLabelText('toolbar.zoomLevel') as HTMLInputElement).disabled).toBe(false)
    })
    return container
  }

  it('Ctrl+滚轮上滚放大，并阻止浏览器默认行为', async () => {
    await load()
    const input = screen.getByLabelText('toolbar.zoomLevel') as HTMLInputElement
    expect(input.value).toBe('100')

    const ev = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(true)
    await waitFor(() => expect(input.value).toBe('110'))
  })

  it('Ctrl+滚轮下滚缩小', async () => {
    await load()
    const input = screen.getByLabelText('toolbar.zoomLevel') as HTMLInputElement
    const ev = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: 100,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    await waitFor(() => expect(input.value).toBe('90'))
  })

  it('普通滚轮不缩放，也不阻止默认行为', async () => {
    await load()
    const input = screen.getByLabelText('toolbar.zoomLevel') as HTMLInputElement
    const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(input.value).toBe('100')
  })

  it('缩放受最小/最大范围限制', async () => {
    await load()
    const input = screen.getByLabelText('toolbar.zoomLevel') as HTMLInputElement
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(
        new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true }),
      )
    }
    await waitFor(() => expect(input.value).toBe(String(MAX_SCALE * 100)))
  })
})
