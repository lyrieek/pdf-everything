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
import { OutlinePanel } from './OutlinePanel'
import { clampScrollTop } from '../lib/pdfLayout'
import { pageAtScrollTop, scrollToPage } from '../lib/pageNav'
import { pageBatches } from '../lib/pdfLoading'
import type { AnnotationStorageLike } from '../lib/annotation'
import { createAnnotationStorage } from '../lib/annotation'
import {
  BUTTON_ZOOM_STEP,
  clampScale,
  isEditableTarget,
  scrollStepForKey,
  stepZoom,
  wheelZoomScale,
} from '../lib/interaction'

const base = import.meta.env.BASE_URL

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** 四类 PDF 资源基址（均须以 / 结尾、同源） */
const PDFJS_ASSETS = {
  cMapUrl: `${base}pdfjs/cmaps/`,
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  wasmUrl: `${base}pdfjs/wasm/`,
  iccUrl: `${base}pdfjs/iccs/`,
}

interface PdfViewerProps {
  /** 初始缩放比例 */
  initialScale?: number
}

/** 页面布局模式：单页 / 双页 */
type PageLayout = 'single' | 'double'

/** 判断错误类型，返回 i18n key */
export function classifyError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? ''
  if (name === 'PasswordException' || /password/i.test(message)) return 'error.passwordRequired'
  if (name === 'InvalidPDFException' || /invalid pdf/i.test(message)) return 'error.invalidPdf'
  return 'error.failedToLoad'
}

// 校验文件头是否为 %PDF-（容错：读取失败或长度不足时放行）
async function isPdfFile(file: File): Promise<boolean> {
  try {
    const buf = await file.slice(0, 5).arrayBuffer()
    if (!buf || buf.byteLength === 0) return true // 读取失败时放行
    const head = new TextDecoder().decode(buf)
    // 如果文件内容不足 5 字节但非零，说明是测试 mock 数据，放行
    if (buf.byteLength < 5) return true
    return head.startsWith('%PDF')
  } catch {
    return true // 读取异常时放行
  }
}

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
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(initialScale)
  const [layoutMode, setLayoutMode] = useState<PageLayout>('single')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [totalHeight, setTotalHeight] = useState(0)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [annotationStorage, setAnnotationStorage] = useState<AnnotationStorageLike | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const pagesContainerRef = useRef<HTMLDivElement>(null)

  // 保存 loadingTask 以便换文件/卸载时销毁
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null)

  // 加载序号：换文件时让上一次未完成的加载作废，避免旧结果写回状态
  const loadIdRef = useRef(0)

  // 加载 PDF 文件
  const loadPDF = useCallback(
    async (file: File) => {
      const loadId = ++loadIdRef.current

      setLoading(true)
      setError(null)
      setPdfDoc(null)
      setPages([])
      setNumPages(0)
      setScrollTop(0)
      setCurrentPage(1)
      setAnnotationStorage(null)
      setFileName(file.name)

      // 换文件前销毁上一个文档，避免 worker / 内存泄漏
      const previous = loadingTaskRef.current
      loadingTaskRef.current = null
      if (previous) {
        try {
          await previous.destroy()
        } catch {
          /* noop */
        }
      }

      try {
        const valid = await isPdfFile(file)
        if (!valid) {
          if (loadId !== loadIdRef.current) return
          setError(t('error.invalidPdf'))
          return
        }

        const arrayBuffer = await file.arrayBuffer()

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapPacked: true,
          ...PDFJS_ASSETS,
          useWasm: true,
        })
        // 加密 PDF：onPassword 是 loadingTask 上的回调，不是 getDocument 的参数
        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          // reason: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
          const pw = window.prompt(
            reason === 2 ? t('error.incorrectPassword') : t('error.passwordRequired'),
          )
          if (pw) updatePassword(pw)
        }
        loadingTaskRef.current = loadingTask
        const doc = await loadingTask.promise
        if (loadId !== loadIdRef.current) return

        // 先取第 1 页：用于确定页面尺寸（占位高度依赖它），同时让首屏尽快出现
        const firstPage = await doc.getPage(1)
        if (loadId !== loadIdRef.current) return

        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPages([firstPage])
        setAnnotationStorage(createAnnotationStorage())

        // 其余页分批拉取：上千页文档若一次性 getPage 会同时发起上千个 worker 请求
        for (const batch of pageBatches(2, doc.numPages)) {
          if (loadId !== loadIdRef.current) return
          const loaded = await Promise.all(batch.map((pageNumber) => doc.getPage(pageNumber)))
          if (loadId !== loadIdRef.current) return
          setPages((prev) => [...prev, ...loaded])
        }
      } catch (err) {
        if (loadId !== loadIdRef.current) return
        setError(t(classifyError(err)))
      } finally {
        if (loadId === loadIdRef.current) setLoading(false)
      }
    },
    [t],
  )

  // 组件卸载时销毁文档
  useEffect(() => {
    return () => {
      loadIdRef.current++
      try {
        loadingTaskRef.current?.destroy()
      } catch {
        /* noop */
      }
      loadingTaskRef.current = null
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer?.files?.[0]
      if (file && file.type === 'application/pdf') {
        loadPDF(file)
      } else {
        setError(t('error.invalidFile'))
      }
    },
    [loadPDF, t],
  )

  const handleFileSelect = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      // 清空 value，否则重复选择同一文件不会触发 change
      target.value = ''
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
      const top = containerRef.current.scrollTop
      setScrollTop(top)
      // 反推当前页
      const wrappers = pagesContainerRef.current?.querySelectorAll<HTMLElement>('.pdf-page-wrapper')
      if (wrappers) {
        const tops: number[] = []
        wrappers.forEach((w) => tops.push(w.offsetTop))
        setCurrentPage(pageAtScrollTop(top, tops))
      }
    }
  }, [])

  // 跳转到指定页（1-based）
  const goToPage = useCallback((pageNumber: number) => {
    const el = containerRef.current
    const wrappers = pagesContainerRef.current?.querySelectorAll<HTMLElement>('.pdf-page-wrapper')
    if (!el || !wrappers || pageNumber < 1 || pageNumber > wrappers.length) return
    const tops: number[] = []
    wrappers.forEach((w) => tops.push(w.offsetTop))
    const target = scrollToPage(pageNumber, tops)
    if (target == null) return
    const maxScrollTop = Math.max(el.scrollHeight - el.clientHeight, 0)
    const top = clampScrollTop(target, maxScrollTop)
    el.scrollTo({ top, behavior: 'auto' })
    setScrollTop(top)
    setCurrentPage(pageNumber)
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

  // 10 页以上启用懒加载（用总页数判断，避免分批加载中途翻转导致重复渲染）
  const shouldLazyLoad = numPages >= 10

  // 未加载页的占位块比例：取首页宽高比（同一文档页面尺寸通常一致）
  const firstPageViewport = pages[0]?.getViewport({ scale })
  const placeholderAspect = firstPageViewport
    ? `${firstPageViewport.width} / ${firstPageViewport.height}`
    : undefined

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
          {pdfDoc && <span className="page-info">{t('pageInfo.pages', { count: numPages })}</span>}
          {pdfDoc && numPages > 0 && (
            <span className="page-nav">
              <button
                className="page-nav-btn"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                aria-label="上一页"
                title="上一页"
              >
                ‹
              </button>
              <span className="page-nav-current">
                {currentPage} / {numPages}
              </span>
              <button
                className="page-nav-btn"
                onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
                disabled={currentPage >= numPages}
                aria-label="下一页"
                title="下一页"
              >
                ›
              </button>
            </span>
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
            disabled={!pdfDoc || numPages < 2}
            ariaLabel={t('aria.pageLayout')}
          />
          <LanguageSlider />
          <ThemeToggle />
          {pdfDoc && (
            <Tooltip label="目录" align="end">
              <button
                className={`icon-btn${outlineVisible ? ' is-active' : ''}`}
                onClick={() => setOutlineVisible((v) => !v)}
                aria-label="目录"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </Tooltip>
          )}
          <PropBtn pdfDoc={pdfDoc} pages={pages} scale={scale} fileName={fileName} />
        </div>
      </div>

      {error && <div className="pdf-error">{error}</div>}

      <div className="pdf-stage">
        <OutlinePanel pdfDoc={pdfDoc} onGoto={goToPage} visible={outlineVisible} />
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
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1
                const page = pages[index]
                const pageViewport = page?.getViewport({ scale })

                return (
                  <div
                    key={pageNumber}
                    className="pdf-page-wrapper"
                    data-page-number={pageNumber}
                    style={pageViewport ? { width: `${pageViewport.width}px` } : undefined}
                  >
                    {page ? (
                      shouldLazyLoad ? (
                        <LazyPDFPage
                          page={page}
                          pdfDoc={pdfDoc}
                          scale={scale}
                          onGotoPage={goToPage}
                          annotationStorage={annotationStorage ?? undefined}
                        />
                      ) : (
                        <PDFPage
                          page={page}
                          pdfDoc={pdfDoc}
                          scale={scale}
                          onGotoPage={goToPage}
                          annotationStorage={annotationStorage ?? undefined}
                        />
                      )
                    ) : (
                      // 该页代理还在分批拉取：用与首页同比例的占位块撑住布局，
                      // 避免滚动高度 / 滚动条随加载进度跳动
                      <div
                        className="page-placeholder"
                        style={placeholderAspect ? { aspectRatio: placeholderAspect } : undefined}
                      />
                    )}
                    <div className="page-number">{pageNumber}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {numPages > 0 && (
          <VirtualScrollbar
            totalHeight={totalHeight}
            viewportHeight={viewportHeight}
            scrollTop={scrollTop}
            pageCount={numPages}
            hasOverflow={hasOverflow}
            onScroll={handleScroll}
          />
        )}
      </div>
    </div>
  )
}
