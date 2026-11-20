import { useRef, useEffect } from 'preact/hooks'
import * as pdfjsLib from 'pdfjs-dist'
import type { AnnotationStorageLike } from '../lib/annotation'
import { createAnnotationStorage, renderAnnotationLayer } from '../lib/annotation'
import type { ContextEditor } from './contextEditor'

interface PDFPageProps {
  /** PDF 页面代理 */
  page: pdfjsLib.PDFPageProxy
  /** PDF 文档代理（用于解析内部链接的 dest） */
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null
  /** 缩放比例 */
  scale: number
  /** 旋转角度（顺时针，0/90/180/270） */
  rotation?: number
  /** 渲染错误回调（同步抛出与异步 reject 都会触发） */
  onRenderError?: (error: Error, pageNumber: number) => void
  /** 内部链接（#page=N）跳转回调 */
  onGotoPage?: (pageNumber: number) => void
  /** 跨页面共享的注解存储（表单值需要跨页/跨缩放保留） */
  annotationStorage?: AnnotationStorageLike
  /** 注解编辑器管理器（提供后启用编辑能力） */
  contextEditor?: ContextEditor | null
  /** 是否处于编辑模式 */
  editing?: boolean
}

/** 是否为「主动取消」导致的异常（切换缩放/换文件/卸载时属正常） */
function isCancelled(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null
  if (!e) return false
  return (
    e.name === 'RenderingCancelledException' ||
    e.name === 'AbortException' ||
    /cancel+ed/i.test(e.message ?? '')
  )
}

/**
 * PDF 页面渲染组件
 * ----------------
 * 四层叠加（同一尺寸、同一 viewport）：
 * canvas（页面外观）→ 文本层（可选中）→ 注解层（链接/表单）→ 编辑器层（可选）
 */
export function PDFPage({
  page,
  pdfDoc,
  scale,
  rotation = 0,
  onRenderError,
  onGotoPage,
  annotationStorage,
  contextEditor = null,
  editing = false,
}: PDFPageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const annotationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale, rotation })

    // backing store 按 DPR 放大，CSS 尺寸保持逻辑像素
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    // 文本层 / 注解层的 setLayerDimensions 依赖这两个变量
    host.style.setProperty('--total-scale-factor', String(viewport.scale))
    host.style.setProperty('--scale-factor', String(viewport.scale))

    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined

    // 注解外观 canvas 映射：hasOwnCanvas 注解的外观先绘制在此 canvas 上，
    // 随后由 AnnotationLayer 在 render 时挂到注解层 DOM 内，与 canvas 同步。
    const annotationCanvasMap = new Map<string, HTMLCanvasElement>()

    // 编辑模式下 canvas 不再绘制可编辑注解（FreeText / Highlight / Ink /
    // Stamp），改由编辑器层绘制，避免与编辑器内容重复。
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']>
    try {
      renderTask = page.render({
        canvas,
        viewport,
        transform,
        annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
        annotationCanvasMap,
        isEditing: !!contextEditor && editing,
      })
    } catch (error) {
      // 同步异常（例如 canvas 已被其它渲染任务占用）也要提示，
      // 否则只会得到一张空白页，用户与开发者都无从排查
      console.error(`PDF 第 ${page.pageNumber} 页渲染启动失败：`, error)
      onRenderError?.(error as Error, page.pageNumber)
      return
    }

    // 文本层：pdfjs v6 的 TextLayer 是 class，必须 new 后调用 render()
    const textContainer = textLayerRef.current
    let textLayer: pdfjsLib.TextLayer | null = null

    if (textContainer) {
      textContainer.replaceChildren()
      try {
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer,
          viewport,
        })
      } catch (error) {
        console.warn('TextLayer 初始化失败：', error)
      }
    }

    // 注解层：链接可点 + 表单可填 + 编辑器接管可编辑注解
    const annotationContainer = annotationRef.current
    let annotationLayer: { destroy: () => void } | null = null

    if (annotationContainer) {
      annotationContainer.replaceChildren()
      try {
        annotationLayer = renderAnnotationLayer({
          div: annotationContainer,
          page,
          pdfDoc,
          viewport,
          annotationStorage: annotationStorage ?? createAnnotationStorage(),
          annotationCanvasMap,
          onGotoPage: onGotoPage ?? (() => {}),
          contextEditor,
          pageIndex: page.pageNumber - 1,
          textLayerDiv: textContainer,
        })
      } catch (error) {
        console.warn('AnnotationLayer 初始化失败：', error)
      }
    }

    renderTask.promise.catch((error: Error) => {
      if (isCancelled(error)) return
      console.error(`PDF 第 ${page.pageNumber} 页渲染失败：`, error)
      onRenderError?.(error, page.pageNumber)
    })

    textLayer?.render().catch((error: Error) => {
      if (isCancelled(error)) return
      console.warn('TextLayer 渲染失败：', error)
    })

    // 缩放切换 / 换文件 / 卸载时取消上一帧渲染
    return () => {
      try {
        renderTask.cancel()
      } catch {
        /* noop */
      }
      try {
        textLayer?.cancel()
      } catch {
        /* noop */
      }
      annotationLayer?.destroy()
    }
  }, [
    page,
    pdfDoc,
    scale,
    rotation,
    onRenderError,
    onGotoPage,
    annotationStorage,
    contextEditor,
    editing,
  ])

  return (
    <div
      ref={hostRef}
      className="pdf-page-canvas"
      data-page-number={page.pageNumber}
      data-rotation={rotation}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas__canvas" />
      <div
        ref={textLayerRef}
        className="pdf-page-canvas__text-layer textLayer"
        data-main-rotation={rotation}
      />
      <div ref={annotationRef} className="pdf-page-canvas__annotation-layer" />
    </div>
  )
}
