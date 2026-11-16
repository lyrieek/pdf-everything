import { useState, useRef, useEffect } from 'preact/hooks'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFPage } from './PDFPage'

interface LazyPDFPageProps {
  /** PDF 页面代理 */
  page: pdfjsLib.PDFPageProxy
  /** 缩放比例 */
  scale: number
}

/** 懒加载 PDF 页面 - 使用 IntersectionObserver 在视口进入时渲染 */
export function LazyPDFPage({ page, scale }: LazyPDFPageProps) {
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
      {isVisible && <PDFPage page={page} scale={scale} />}
      {!isVisible && <div className="page-placeholder" />}
    </div>
  )
}
