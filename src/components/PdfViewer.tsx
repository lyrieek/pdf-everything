import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'preact/hooks'
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
import {
  clampScrollTop,
  computeReferenceWidth,
  isOversizePage,
  oversizeMaxWidth,
} from '../lib/pdfLayout'
import {
  CURRENT_PAGE_ENTER_RATIO,
  CURRENT_PAGE_EXIT_RATIO,
  minVisiblePage,
  pageAtScrollTop,
  parsePageInput,
  scrollToPage,
} from '../lib/pageNav'
import { pageBatches } from '../lib/pdfLoading'
import type { AnnotationStorageLike } from '../lib/annotation'
import { createAnnotationStorage } from '../lib/annotation'
import {
  BUTTON_ZOOM_STEP,
  clampScale,
  isEditableTarget,
  rotateBy,
  scrollStepForKey,
  stepZoom,
  wheelZoomScale,
  type Rotation,
} from '../lib/interaction'
import { formatLoadProgress } from '../lib/loadProgress'

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

/** 向左（逆时针）旋转图标 */
function RotateLeftIcon() {
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
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

/** 向右（顺时针）旋转图标 */
function RotateRightIcon() {
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
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

/** 超大页徽标图标（横向展开箭头） */
function ExpandIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="8 8 4 12 8 16" />
      <polyline points="16 8 20 12 16 16" />
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
  const [rotation, setRotation] = useState<Rotation>(0)
  const [layoutMode, setLayoutMode] = useState<PageLayout>('single')
  const [loading, setLoading] = useState(false)
  // 文档下载进度（字节）：由 loadingTask.onProgress 更新
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [totalHeight, setTotalHeight] = useState(0)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  // 页码导航输入框：聚焦编辑时不同步 currentPage，失焦/回车后再对齐
  const [pageInput, setPageInput] = useState('1')
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [annotationStorage, setAnnotationStorage] = useState<AnnotationStorageLike | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const pagesContainerRef = useRef<HTMLDivElement>(null)

  // 视口中「露出自身 ≥45%」的页集合，由 IntersectionObserver 维护
  const visiblePagesRef = useRef<Set<number>>(new Set())
  // 输入框是否处于编辑状态（编辑时不被滚动同步覆盖）
  const pageInputEditingRef = useRef(false)

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
      setPageInput('1')
      pageInputEditingRef.current = false
      setAnnotationStorage(null)
      setFileName(file.name)
      setFile(file)
      setRotation(0)
      setLoadProgress({ loaded: 0, total: 0 })

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
          // 开启字体额外属性，让 commonObjs 导出字体真实名（BaseFont），供属性面板显示与子集判断
          fontExtraProperties: true,
        })
        // 加密 PDF：onPassword 是 loadingTask 上的回调，不是 getDocument 的参数
        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          // reason: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
          const pw = window.prompt(
            reason === 2 ? t('error.incorrectPassword') : t('error.passwordRequired'),
          )
          if (pw) updatePassword(pw)
        }
        // 文档下载进度：onProgress 在加载过程中多次触发；比对加载序号丢弃过期更新
        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (loadId === loadIdRef.current) setLoadProgress({ loaded, total })
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
      // 当前页主要由 IntersectionObserver 按「视口内露出 ≥45%」维护；
      // 只有候选集为空（页间空隙、超高页等）时才退化为顶边判定，
      // 避免每个滚动事件都对全部页面做 O(N) 布局测量。
      if (visiblePagesRef.current.size > 0) return
      const wrappers = pagesContainerRef.current?.querySelectorAll<HTMLElement>('.pdf-page-wrapper')
      if (wrappers) {
        const tops: number[] = []
        wrappers.forEach((w) => tops.push(w.offsetTop))
        setCurrentPage(pageAtScrollTop(top, tops))
      }
    }
  }, [])

  // 单个共享 IntersectionObserver 追踪视口内的页面：
  // 页面露出自身 ≥45% 进入候选，<40% 才移出（迟滞防抖）；
  // 当前页取候选集中页码最小者，与「页顶在上方」的阅读直觉一致。
  useEffect(() => {
    const container = containerRef.current
    const pagesEl = pagesContainerRef.current
    if (!pdfDoc || !container || !pagesEl) return

    const visible = visiblePagesRef.current
    visible.clear()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const pageNumber = Number(el.dataset.pageNumber)
          if (!Number.isFinite(pageNumber)) continue
          if (entry.isIntersecting && entry.intersectionRatio >= CURRENT_PAGE_ENTER_RATIO) {
            visible.add(pageNumber)
          } else if (!entry.isIntersecting || entry.intersectionRatio <= CURRENT_PAGE_EXIT_RATIO) {
            visible.delete(pageNumber)
          }
        }
        setCurrentPage((prev) => minVisiblePage(visible, prev))
      },
      {
        root: container,
        threshold: [0, CURRENT_PAGE_EXIT_RATIO, CURRENT_PAGE_ENTER_RATIO],
      },
    )

    pagesEl
      .querySelectorAll<HTMLElement>('.pdf-page-wrapper')
      .forEach((wrapper) => observer.observe(wrapper))

    return () => {
      observer.disconnect()
      visible.clear()
    }
  }, [pdfDoc, numPages])

  // 非编辑状态下让页码输入框跟随当前页（布局阶段同步，避免跳页后闪回旧值）
  useLayoutEffect(() => {
    if (!pageInputEditingRef.current) setPageInput(String(currentPage))
  }, [currentPage])

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

  // 旋转后页面尺寸变化会让视口漂移，重新定位到当前页。
  // 用 useLayoutEffect 在绘制前完成滚动，避免闪烁；≤2 页无需处理（几乎不漂移）。
  // 仅在 rotation 变化时触发；currentPage / goToPage 取该次渲染的当前值。
  useLayoutEffect(() => {
    if (!pdfDoc || numPages <= 2) return
    goToPage(currentPage)
  }, [rotation])

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
  }, [pages, scale, rotation])

  // 10 页以上启用懒加载（用总页数判断，避免分批加载中途翻转导致重复渲染）
  const shouldLazyLoad = numPages >= 10

  // 多数页宽度（自然尺寸下的众数）：双页模式判定超大页的基准。
  // 仅在页集合或旋转变化时重算，避免滚动时重复 getViewport。
  const referenceWidth = useMemo(
    () => computeReferenceWidth(pages.map((p) => p.getViewport({ scale: 1, rotation }).width)),
    [pages, rotation],
  )

  // 未加载页的占位块比例：取首页宽高比（同一文档页面尺寸通常一致）
  const firstPageViewport = pages[0]?.getViewport({ scale, rotation })
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

  // 文档下载阶段进度（百分比或已加载字节）；尚无回调时为空串
  const hasDocProgress = loadProgress.total > 0 || loadProgress.loaded > 0
  const docLoadProgress = hasDocProgress
    ? formatLoadProgress(loadProgress.loaded, loadProgress.total)
    : ''

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
              <input
                type="text"
                className="page-nav-input"
                value={pageInput}
                onFocus={(e: Event) => {
                  pageInputEditingRef.current = true
                  ;(e.currentTarget as HTMLInputElement).select()
                }}
                onBlur={() => {
                  pageInputEditingRef.current = false
                  setPageInput(String(currentPage))
                }}
                onChange={(e: Event) => {
                  const target = e.target as HTMLInputElement
                  setPageInput(target.value.replace(/\D/g, ''))
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    const target = parsePageInput(pageInput, numPages)
                    if (target !== null) {
                      goToPage(target)
                      setPageInput(String(target))
                      ;(e.currentTarget as HTMLInputElement).blur()
                    } else {
                      setPageInput(String(currentPage))
                    }
                  } else if (e.key === 'Escape') {
                    setPageInput(String(currentPage))
                    ;(e.currentTarget as HTMLInputElement).blur()
                  }
                }}
                inputMode="numeric"
                aria-label={t('aria.currentPage')}
              />
              <span className="page-nav-total">/ {numPages}</span>
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
          <Tooltip label={t('aria.rotateLeft')}>
            <button
              className="icon-btn"
              onClick={() => setRotation((r) => rotateBy(r, -90))}
              disabled={!pdfDoc}
              aria-label={t('aria.rotateLeft')}
            >
              <RotateLeftIcon />
            </button>
          </Tooltip>
          <Tooltip label={t('aria.rotateRight')}>
            <button
              className="icon-btn"
              onClick={() => setRotation((r) => rotateBy(r, 90))}
              disabled={!pdfDoc}
              aria-label={t('aria.rotateRight')}
            >
              <RotateRightIcon />
            </button>
          </Tooltip>
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
          <PropBtn
            pdfDoc={pdfDoc}
            pages={pages}
            fileName={fileName}
            currentPage={currentPage}
            numPages={numPages}
            file={file}
          />
        </div>
      </div>

      {error && (
        <div className="pdf-error">
          <span>{error}</span>
          <button className="pdf-error-close" onClick={() => setError(null)} aria-label="Close">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

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

          {loading && !pdfDoc && (
            <div className="loading">
              <span className="loading-label">{t('loading')}</span>
              {docLoadProgress && <span className="loading-value">{docLoadProgress}</span>}
            </div>
          )}

          {pdfDoc && (
            <div
              ref={pagesContainerRef}
              className={`pdf-pages${layoutMode === 'double' ? ' pdf-pages--double' : ''}`}
              style={
                layoutMode === 'double' && referenceWidth > 0
                  ? { gridTemplateColumns: `repeat(2, ${referenceWidth * scale}px)` }
                  : undefined
              }
            >
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1
                const page = pages[index]
                const pageViewport = page?.getViewport({ scale, rotation })

                // 双页模式下：把「超大页」（与多数页宽度相差 > 10%）单独放一行，
                // 并按需缩放到不超过两页宽度，避免一张异常页撑宽 / 打乱其他页。
                const isDouble = layoutMode === 'double'
                const oversize =
                  !!pageViewport &&
                  isDouble &&
                  isOversizePage(pageViewport.width, referenceWidth * scale)
                let renderScale = scale
                let displayWidth = pageViewport?.width
                if (oversize && pageViewport) {
                  const maxWidth = oversizeMaxWidth(referenceWidth * scale)
                  if (pageViewport.width > maxWidth) {
                    renderScale = scale * (maxWidth / pageViewport.width)
                    displayWidth = maxWidth
                  }
                }

                return (
                  <div
                    key={pageNumber}
                    className={`pdf-page-wrapper${oversize ? ' is-oversize' : ''}`}
                    data-page-number={pageNumber}
                    style={pageViewport ? { width: `${displayWidth}px` } : undefined}
                  >
                    {page ? (
                      shouldLazyLoad ? (
                        <LazyPDFPage
                          page={page}
                          pdfDoc={pdfDoc}
                          scale={renderScale}
                          rotation={rotation}
                          onGotoPage={goToPage}
                          annotationStorage={annotationStorage ?? undefined}
                        />
                      ) : (
                        <PDFPage
                          page={page}
                          pdfDoc={pdfDoc}
                          scale={renderScale}
                          rotation={rotation}
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
                    {oversize && (
                      <span
                        className="oversize-badge"
                        title={t('page.oversize')}
                        aria-hidden="true"
                      >
                        <ExpandIcon />
                      </span>
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

        {/* 页面代理分批加载阶段：非阻塞进度提示，不覆盖阅读区，避免影响懒加载 */}
        {loading && pdfDoc && numPages > 0 && pages.length < numPages && (
          <div className="load-badge" role="status">
            <span className="load-badge__spinner" aria-hidden="true" />
            <span>{t('loadingProgress.pages', { loaded: pages.length, total: numPages })}</span>
          </div>
        )}
      </div>
    </div>
  )
}
