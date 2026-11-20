import { useEffect, useState } from 'preact/hooks'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import {
  filterAnnotations,
  normalizeAnnotation,
  sortAnnotations,
  type AnnotationListItem,
  type AnnotationScope,
  type RawPdfAnnotation,
} from './annotationTypes'

export interface UseAnnotationsOptions {
  pdfDoc: PDFDocumentProxy | null
  pages: PDFPageProxy[]
  currentPage: number
  scope: AnnotationScope
}

export interface UseAnnotationsResult {
  items: AnnotationListItem[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAnnotations(options: UseAnnotationsOptions): UseAnnotationsResult {
  const { pdfDoc, pages, currentPage, scope } = options
  const [items, setItems] = useState<AnnotationListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const currentPageIndex = Math.max(0, Math.min((pdfDoc?.numPages ?? 1) - 1, currentPage - 1))
  const targetPage = scope === 'current' ? currentPageIndex : null

  useEffect(() => {
    if (!pdfDoc) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const pageIndexes =
      scope === 'current'
        ? [currentPageIndex]
        : Array.from({ length: pdfDoc.numPages }, (_, index) => index)

    const load = async () => {
      const collected: AnnotationListItem[] = []

      for (const pageIndex of pageIndexes) {
        if (cancelled) return
        try {
          const page = pages[pageIndex] ?? (await pdfDoc.getPage(pageIndex + 1))
          const annotations = (await page.getAnnotations({
            intent: 'display',
          })) as RawPdfAnnotation[]
          // index 必须是该页 /Annots 数组内的下标（pdf-lib 按同一顺序定位），
          // 不能用跨页累计长度，否则多页文档会错位。
          annotations?.forEach((data, index) => {
            collected.push(normalizeAnnotation(data, pageIndex, index))
          })
        } catch (err) {
          if (!cancelled) {
            console.warn(`加载第 ${pageIndex + 1} 页注解失败：`, err)
          }
        }

        if (!cancelled && scope === 'all') {
          setItems(sortAnnotations(filterAnnotations(collected)))
        }
      }

      if (!cancelled) {
        setItems(sortAnnotations(filterAnnotations(collected)))
        setLoading(false)
      }
    }

    load().catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [pdfDoc, pages, scope, targetPage, reloadToken])

  const reload = () => setReloadToken((value) => value + 1)

  return { items, loading, error, reload }
}
