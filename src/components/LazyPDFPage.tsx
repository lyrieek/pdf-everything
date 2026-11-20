import { useState, useRef, useEffect } from 'preact/hooks'
import type * as pdfjsLib from 'pdfjs-dist'

import type { AnnotationStorageLike } from '../lib/annotation'
import type { ContextEditor } from './contextEditor'
import { PDFPage } from './PDFPage'

interface LazyPDFPageProps {
  /** PDF 页面代理 */
  page: pdfjsLib.PDFPageProxy
  /** PDF 文档代理（用于解析内部链接的 dest） */
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null
  /** 缩放比例 */
  scale: number
  /** 旋转角度（顺时针，0/90/180/270） */
  rotation?: number
  /** 渲染错误回调 */
  onRenderError?: (error: Error, pageNumber: number) => void
  /** 内部链接（#page=N）跳转回调 */
  onGotoPage?: (pageNumber: number) => void
  /** 跨页面共享的注解存储 */
  annotationStorage?: AnnotationStorageLike
  /** 注解编辑器管理器（提供后启用编辑能力） */
  contextEditor?: ContextEditor | null
  /** 是否处于编辑模式 */
  editing?: boolean
}

/** 懒加载 PDF 页面 - 使用 IntersectionObserver 在视口进入时渲染 */
export function LazyPDFPage({
  page,
  pdfDoc,
  scale,
  rotation = 0,
  onRenderError,
  onGotoPage,
  annotationStorage,
  contextEditor,
  editing,
}: LazyPDFPageProps) {
  const [isVisible, setIsVisible] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect()
          }
        })
      },
      { rootMargin: '200px' },
    )

    if (elementRef.current) {
      observer.observe(elementRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={elementRef} className="lazy-page-wrapper">
      {isVisible && (
        <PDFPage
          page={page}
          pdfDoc={pdfDoc}
          scale={scale}
          rotation={rotation}
          onRenderError={onRenderError}
          onGotoPage={onGotoPage}
          annotationStorage={annotationStorage}
          contextEditor={contextEditor}
          editing={editing}
        />
      )}
      {!isVisible && <div className="page-placeholder" />}
    </div>
  )
}
