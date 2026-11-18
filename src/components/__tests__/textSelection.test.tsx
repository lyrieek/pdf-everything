import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/preact'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFPage } from '../PDFPage'

// 本测试只关心「文本层可被选中」，不需要真实 pdfjs 渲染，挡掉 TextLayer 噪音
vi.mock('pdfjs-dist', () => ({
  TextLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), cancel: vi.fn() })),
  AnnotationLayer: vi.fn(() => ({ render: vi.fn(() => Promise.resolve()), destroy: vi.fn() })),
  AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2, ENABLE_STORAGE: 3 },
}))

// 选中高亮必须走半透明的 --selection-bg，而不是不透明的 --accent（否则整片死红、盖住文字）
const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8')

/** 从 CSS 文本里抠出 `.pdf-page-canvas__text-layer ::selection { ... }` 规则体 */
function selectionRuleBody(css: string): string {
  const match = css.match(/\.pdf-page-canvas__text-layer\s+::selection\s*\{([^}]*)\}/)
  return match ? match[1] : ''
}

/** 取 `--selection-bg` 变量定义值 */
function selectionBgValue(css: string): string {
  const match = css.match(/--selection-bg:\s*([^;]+);/)
  return match ? match[1].trim() : ''
}

describe('文本选中样式（防止「选中文本整片变红」回归）', () => {
  it('::selection 使用 --selection-bg，而非 --accent', () => {
    const body = selectionRuleBody(appCss)
    expect(body).not.toBe('')
    expect(body).toContain('var(--selection-bg)')
    // 关键回归：不再用不透明的强调色（红色）
    expect(body).not.toContain('var(--accent)')
  })

  it('--selection-bg 是半透明色（rgba，alpha < 1），选中后仍能看清文字', () => {
    const value = selectionBgValue(appCss)
    expect(value).toMatch(/^rgba\(/)
    const alpha = Number(value.match(/,\s*([\d.]+)\s*\)$/)?.[1])
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(1)
  })

  it('选中文字颜色保持 transparent（字形由 canvas 绘制，避免重影）', () => {
    const body = selectionRuleBody(appCss)
    expect(body).toContain('transparent')
  })
})

describe('文本层可选择（Selection / Range 行为）', () => {
  beforeEach(() => vi.clearAllMocks())

  function makePage() {
    return {
      getViewport: vi.fn(() => ({ width: 400, height: 500 })),
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
  }

  it('跨多个 span 选中时，getSelection().toString() 返回拼接后的文本', async () => {
    const { container } = render(<PDFPage page={makePage() as never} scale={1} />)

    // 模拟 pdf.js TextLayer 产出的文本层结构（每个文本块一个 span）
    const textLayer = container.querySelector('.pdf-page-canvas__text-layer') as HTMLElement
    textLayer.innerHTML = '<span>Hello</span><span>PDF</span><span>Selection</span>'
    const spans = textLayer.querySelectorAll('span')
    expect(spans.length).toBe(3)

    // 从第一个 span 起点选到最后一个 span 终点
    const range = document.createRange()
    range.setStart(spans[0].firstChild!, 0)
    range.setEnd(spans[2].firstChild!, spans[2].textContent!.length)

    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(selection.isCollapsed).toBe(false)
    expect(selection.toString()).toBe('HelloPDFSelection')
  })

  it('选中文本可被复制（ toString 即剪贴板内容来源）', async () => {
    const { container } = render(<PDFPage page={makePage() as never} scale={1} />)
    const textLayer = container.querySelector('.pdf-page-canvas__text-layer') as HTMLElement
    textLayer.innerHTML = '<span>可复制</span><span>文本</span>'

    const spans = textLayer.querySelectorAll('span')
    const range = document.createRange()
    range.setStart(spans[0].firstChild!, 0)
    range.setEnd(spans[1].firstChild!, spans[1].textContent!.length)

    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(selection.toString()).toBe('可复制文本')
  })
})
