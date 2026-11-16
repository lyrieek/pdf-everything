import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import * as pdfjsLib from 'pdfjs-dist'

// 组件样式
import './VirtualScrollbar.css'
import './LazyPDFPage.css'

// 子组件
import { VirtualScrollbar } from './VirtualScrollbar'
import { LazyPDFPage } from './LazyPDFPage'
import { PDFPage } from './PDFPage'
import { ThemeToggle } from './ThemeToggle'
import { PropBtn } from './PropBtn'
import { Slider } from './Slider'
import type { SliderOption } from './Slider'
import { LanguageSlider } from './LanguageSlider'
import { Tooltip } from './Tooltip'
import { clampScrollTop } from '../lib/pdfLayout'
import {
  BUTTON_ZOOM_STEP,
  clampScale,
  isEditableTarget,
  scrollStepForKey,
  stepZoom,
  wheelZoomScale,
} from '../lib/interaction'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfViewerProps {
  /** 初始缩放比例 */
  initialScale?: number
}

/** 页面布局模式：单页 / 双页 */
type PageLayout = 'single' | 'double'

/** 单页视图图标 */
function SinglePageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="3" width="12" height="18" rx="2" />
    </svg>
  )
}

/** 双页视图图标 */
function DoublePageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="8" height="14" rx="1.5" />
      <rect x="13" y="5" width="8" height="14" rx="1.5" />
    </svg>
  )
}

/** PDF 查看器主组件 */
export function PdfViewer({ initialScale = 1.0 }: PdfViewerProps) {
  const { t } = useTranslation()
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<pdfjsLib.PDFPageProxy[]>([])
  const [scale, setScale] = useState(initialScale)
  const [layoutMode, setLayoutMode] = useState<PageLayout>('single')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [totalHeight, setTotalHeight] = useState(0)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [fileName, setFileName] = useState<string>('')

  const containerRef = useRef<HTMLDivElement>(null)
  const pagesContainerRef = useRef<HTMLDivElement>(null)

  // 加载 PDF 文件
  const loadPDF = useCallback(
    async (file: File) => {
      setLoading(true)
      setError(null)
      setPdfDoc(null)
      setPages([])
      setScrollTop(0)
      setFileName(file.name)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const doc = await loadingTask.promise
        setPdfDoc(doc)

        const pagePromises: Promise<pdfjsLib.PDFPageProxy>[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          pagePromises.push(doc.getPage(i))
        }
        const loadedPages = await Promise.all(pagePromises)
        setPages(loadedPages)
      } catch (err) {
        setError(t('error.failedToLoad'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer?.files[0]
      if (file && file.type === 'application/pdf') {
        loadPDF(file)
      } else {
        setError(t('error.invalidFile'))
      }
    },
    [loadPDF],
  )

  const handleFileSelect = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (file && file.type === 'application/pdf') {
        loadPDF(file)
      }
    },
    [loadPDF],
  )

  const handleScroll = useCallback((top: number) => {
    setScrollTop(top)
    containerRef.current?.scrollTo({ top, behavior: 'auto' })
  }, [])

  const handleContainerScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop)
    }
  }, [])

  // 监听视口高度与内容真实高度
  // 内容高度取容器的 scrollHeight，确保与 canvas 实际渲染尺寸一致，
  // 不会因为估算值偏小把页面截断
  useEffect(() => {
    const container = containerRef.current
    const pagesEl = pagesContainerRef.current
    if (!container) return

    const measure = () => {
      setViewportHeight(container.clientHeight)
      setTotalHeight(container.scrollHeight)
      setScrollTop(container.scrollTop)
      setHasOverflow(
        container.scrollHeight > container.clientHeight ||
          container.scrollWidth > container.clientWidth,
      )
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    if (pagesEl) observer.observe(pagesEl)

    return () => observer.disconnect()
  }, [pages, scale])

  // 10 页以上启用懒加载
  const shouldLazyLoad = pages.length >= 10

  // 接管浏览器 Ctrl/Cmd + 滚轮缩放：拦截默认缩放，改为缩放 PDF
  useEffect(() => {
    if (!pdfDoc) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale((s) => wheelZoomScale(s, e.deltaY))
    }

    // 必须使用非被动监听，才能 preventDefault 阻止浏览器缩放
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [pdfDoc])

  // 键盘导航：方向键 / Page Up/Down / Home / End 滚动
  useEffect(() => {
    if (!pdfDoc) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 输入框内不劫持按键
      if (isEditableTarget(e.target)) return

      const el = containerRef.current
      if (!el) return

      const delta = scrollStepForKey(e.key, el.clientHeight)
      if (delta === null) return

      e.preventDefault()
      const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
      const top = clampScrollTop(el.scrollTop + delta, maxScrollTop)
      el.scrollTo({ top, behavior: 'auto' })
      setScrollTop(top)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pdfDoc])

  const layoutOptions: readonly SliderOption<PageLayout>[] = [
    { value: 'single', label: t('toolbar.singlePage'), icon: <SinglePageIcon /> },
    { value: 'double', label: t('toolbar.doublePage'), icon: <DoublePageIcon /> },
  ]

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="toolbar-left">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="file-input"
            id="file-input"
          />
          <label htmlFor="file-input" className="file-label">
            {pdfDoc ? t('toolbar.changePdf') : t('toolbar.selectPdf')}
          </label>
          {pdfDoc && (
            <span className="page-info">{t('pageInfo.pages', { count: pages.length })}</span>
          )}
        </div>
        <div className="toolbar-center">
          <Tooltip label={t('aria.zoomOut')}>
            <button
              className="zoom-btn"
              onClick={() => setScale((s) => stepZoom(s, -BUTTON_ZOOM_STEP))}
              disabled={!pdfDoc}
              aria-label={t('aria.zoomOut')}
            >
              −
            </button>
          </Tooltip>
          <input
            type="text"
            className="zoom-input"
            value={Math.round(scale * 100)}
            onChange={(e: Event) => {
              const target = e.target as HTMLInputElement
              const val = parseInt(target.value, 10)
              if (!isNaN(val) && val >= 50 && val <= 300) {
                setScale(clampScale(val / 100))
              }
            }}
            onBlur={(e: Event) => {
              const target = e.target as HTMLInputElement
              const val = parseInt(target.value, 10)
              if (isNaN(val) || val < 50) target.value = '50'
              else if (val > 300) target.value = '300'
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            }}
            disabled={!pdfDoc}
            aria-label={t('toolbar.zoomLevel')}
          />
          <Tooltip label={t('aria.zoomIn')}>
            <button
              className="zoom-btn"
              onClick={() => setScale((s) => stepZoom(s, BUTTON_ZOOM_STEP))}
              disabled={!pdfDoc}
              aria-label={t('aria.zoomIn')}
            >
              +
            </button>
          </Tooltip>
        </div>
        <div className="toolbar-right">
          <Slider
            value={layoutMode}
            options={layoutOptions}
            onChange={setLayoutMode}
            disabled={!pdfDoc || pages.length < 2}
            ariaLabel={t('aria.pageLayout')}
          />
          <LanguageSlider />
          <ThemeToggle />
          <PropBtn pdfDoc={pdfDoc} pages={pages} scale={scale} fileName={fileName} />
        </div>
      </div>

      {error && <div className="pdf-error">{error}</div>}

      <div className="pdf-stage">
        <div
          ref={containerRef}
          id="pdf-scroll-container"
          className="pdf-container"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onScroll={handleContainerScroll}
        >
          {!pdfDoc && (
            <div className="drop-zone">
              <p>{t('dropZone.title')}</p>
              <p className="drop-hint">{t('dropZone.hint')}</p>
            </div>
          )}

          {loading && <div className="loading">{t('loading')}</div>}

          {pdfDoc && (
            <div
              ref={pagesContainerRef}
              className={`pdf-pages${layoutMode === 'double' ? ' pdf-pages--double' : ''}`}
            >
              {pages.map((page, index) => (
                <div
                  key={index}
                  className="pdf-page-wrapper"
                  data-page-number={index + 1}
                  style={{ width: `${page.getViewport({ scale }).width}px` }}
                >
                  {shouldLazyLoad ? (
                    <LazyPDFPage page={page} scale={scale} />
                  ) : (
                    <PDFPage page={page} scale={scale} />
                  )}
                  <div className="page-number">{index + 1}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {pages.length > 0 && (
          <VirtualScrollbar
            totalHeight={totalHeight}
            viewportHeight={viewportHeight}
            scrollTop={scrollTop}
            pageCount={pages.length}
            hasOverflow={hasOverflow}
            onScroll={handleScroll}
          />
        )}
      </div>
    </div>
  )
}
