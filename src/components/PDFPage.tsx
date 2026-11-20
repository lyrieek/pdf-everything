import { useRef, useEffect } from 'preact/hooks'
import * as pdfjsLib from 'pdfjs-dist'
import type { AnnotationStorageLike } from '../lib/annotation'
import { createAnnotationStorage, renderAnnotationLayer } from '../lib/annotation'

interface PDFPageProps {
  /** PDF 页面代理 */
  page: pdfjsLib.PDFPageProxy
  /** PDF 文档代理（用于解析内部链接的 dest） */
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null
  /** 缩放比例 */
  scale: number
  /** 旋转角度（顺时针，0/90/180/270） */
  rotation?: number
  /** 渲染错误回调 */
  onRenderError?: (error: Error) => void
  /** 内部链接（#page=N）跳转回调 */
  onGotoPage?: (pageNumber: number) => void
  /** 跨页面共享的注解存储（表单值需要跨页/跨缩放保留） */
  annotationStorage?: AnnotationStorageLike
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
 * canvas（页面外观）→ 文本层（可选中）→ 注解层（链接/表单）→ 未用层
 */
export function PDFPage({
  page,
  pdfDoc,
  scale,
  rotation = 0,
  onRenderError,
  onGotoPage,
  annotationStorage,
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

    // 表单字段交给注解层渲染，canvas 不再重复绘制交互式控件
    const renderTask = page.render({
      canvas,
      viewport,
      transform,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
      annotationCanvasMap,
    })

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

    // 注解层：链接可点 + 表单可填
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
        })
      } catch (error) {
        console.warn('AnnotationLayer 初始化失败：', error)
      }
    }

    renderTask.promise.catch((error: Error) => {
      if (isCancelled(error)) return
      onRenderError?.(error)
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
  }, [page, pdfDoc, scale, rotation, onRenderError, onGotoPage, annotationStorage])

  return (
    <div ref={hostRef} className="pdf-page-canvas">
      <canvas ref={canvasRef} className="pdf-page-canvas__canvas" />
      <div ref={textLayerRef} className="pdf-page-canvas__text-layer" />
      <div ref={annotationRef} className="pdf-page-canvas__annotation-layer" />
    </div>
  )
}
