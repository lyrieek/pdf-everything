import { useRef, useEffect } from 'preact/hooks'
import * as pdfjsLib from 'pdfjs-dist'

interface PDFPageProps {
  /** PDF 页面代理 */
  page: pdfjsLib.PDFPageProxy
  /** 缩放比例 */
  scale: number
  /** 渲染错误回调 */
  onRenderError?: (error: Error) => void
}

/** PDF 页面渲染组件 - 使用 canvas 渲染单页 PDF */
export function PDFPage({ page, scale, onRenderError }: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return

    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height

    const renderContext = {
      canvasContext: context,
      viewport,
      canvas,
    }

    page.render(renderContext).promise.catch((error: Error) => {
      onRenderError?.(error)
    })
  }, [page, scale, onRenderError])

  return <canvas ref={canvasRef} />
}
