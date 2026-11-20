import { useCallback, useEffect, useState } from 'preact/hooks'
import * as pdfAnnotationOps from './pdfAnnotationOps'

export type PdfRect = [number, number, number, number]

export interface UseAnnotationEditingReturn {
  addAnnotation: (
    pageNumber: number,
    contents?: string,
    author?: string,
    rect?: PdfRect,
  ) => Promise<void>
  deleteAnnotation: (pageNumber: number, index: number) => Promise<void>
  editAnnotation: (
    pageNumber: number,
    index: number,
    contents?: string,
    author?: string,
  ) => Promise<void>
  relocateAnnotation: (pageNumber: number, index: number, rect: PdfRect) => Promise<void>
  setAnnotationIcon: (pageNumber: number, index: number, iconName: string) => Promise<void>
  loading: boolean
  error: string | null
  clearError: () => void
}

/**
 * 注解增删改。
 *
 * 所有操作都基于原始 `File` 字节：用 pdf-lib 修改 `/Annots` 后保存，
 * 再通过 `onModified` 交给 PdfViewer 重新加载成新的 pdf.js 文档。
 */
export function useAnnotationEditing(
  file: File | null,
  onModified: (bytes: Uint8Array) => void | Promise<void>,
): UseAnnotationEditingReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 换文件后清掉上一份文档的错误（例如加密提示不应带到新文件）
  useEffect(() => {
    setError(null)
    setLoading(false)
  }, [file])

  const run = async (fn: () => Promise<Uint8Array>) => {
    setLoading(true)
    setError(null)
    try {
      const bytes = await fn()
      await onModified(bytes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const withDocument = async (
    fn: (doc: import('pdf-lib').PDFDocument) => Promise<void>,
  ): Promise<Uint8Array> => {
    if (!file) throw new Error('没有 PDF 文件')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const doc = await pdfAnnotationOps.loadPdfBytes(bytes)
    await fn(doc)
    return pdfAnnotationOps.saveDocument(doc)
  }

  const addAnnotation = useCallback(
    (pageNumber: number, contents?: string, author?: string, rect?: PdfRect) =>
      run(() =>
        withDocument((doc) =>
          pdfAnnotationOps.addTextAnnotation(doc, pageNumber, {
            contents: contents ?? '',
            author: author ?? '',
            rect,
          }),
        ),
      ),
    [file, onModified],
  )

  const deleteAnnotation = useCallback(
    (pageNumber: number, index: number) =>
      run(() => withDocument((doc) => pdfAnnotationOps.deleteAnnotation(doc, pageNumber, index))),
    [file, onModified],
  )

  const editAnnotation = useCallback(
    (pageNumber: number, index: number, contents?: string, author?: string) =>
      run(() =>
        withDocument((doc) =>
          pdfAnnotationOps.updateAnnotation(doc, pageNumber, index, { contents, author }),
        ),
      ),
    [file, onModified],
  )

  const relocateAnnotation = useCallback(
    (pageNumber: number, index: number, rect: PdfRect) =>
      run(() =>
        withDocument((doc) => pdfAnnotationOps.updateAnnotationRect(doc, pageNumber, index, rect)),
      ),
    [file, onModified],
  )

  const setAnnotationIcon = useCallback(
    (pageNumber: number, index: number, iconName: string) =>
      run(() =>
        withDocument((doc) =>
          pdfAnnotationOps.updateAnnotationIcon(doc, pageNumber, index, iconName),
        ),
      ),
    [file, onModified],
  )

  return {
    addAnnotation,
    deleteAnnotation,
    editAnnotation,
    relocateAnnotation,
    setAnnotationIcon,
    loading,
    error,
    clearError: () => setError(null),
  }
}
