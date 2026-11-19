import { useEffect, useRef, useState } from 'preact/hooks'
import { OPS } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { collectFonts, type PdfFont } from './pdfFonts'

/** 字体扫描：最多扫描前 50 页、每批 8 页、最多收集 50 种（控制打开属性窗口的开销） */
const FONT_SCAN_PAGE_LIMIT = 50
const FONT_SCAN_BATCH = 8
const FONT_LIST_LIMIT = 50

/** 行内最多预览几个字体 */
const FONT_PREVIEW_LIMIT = 3

interface UsePdfFontsOptions {
  pdfDoc: PDFDocumentProxy | null
  /** 总页数（由调用方算好传入） */
  totalPages: number
  isOpen: boolean
}

/**
 * 字体列表：打开属性窗口时扫描前 50 页的 `getOperatorList()`，收集字体名与是否嵌入。
 *
 * - 行内最多显示 3 个（逗号分隔）；
 * - 超过 3 个时 `showMore` 为 true，调用方可弹出完整列表；
 * - 结果按 `pdfDoc` 缓存，单页失败忽略。
 */
export function usePdfFonts({ pdfDoc, totalPages, isOpen }: UsePdfFontsOptions) {
  const [fonts, setFonts] = useState<PdfFont[]>([])
  const [fontsState, setFontsState] = useState<'idle' | 'calculating' | 'done' | 'error'>('idle')
  const [fontModalOpen, setFontModalOpen] = useState(false)
  const fontsCache = useRef<{ pdfDoc: PDFDocumentProxy; fonts: PdfFont[] } | null>(null)

  // 换文档时清空
  useEffect(() => {
    setFonts([])
    setFontsState('idle')
    setFontModalOpen(false)
  }, [pdfDoc])

  // 主弹窗关闭时收起字体弹窗
  useEffect(() => {
    if (!isOpen) setFontModalOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !pdfDoc || totalPages <= 0) return
    if (fontsCache.current?.pdfDoc === pdfDoc) {
      setFonts(fontsCache.current.fonts)
      setFontsState('done')
      return
    }

    let cancelled = false
    setFontsState('calculating')
    void (async () => {
      try {
        // 让出主线程：先渲染弹窗
        await new Promise((resolve) => setTimeout(resolve, 0))
        const map = new Map<string, PdfFont>()
        const limit = Math.min(totalPages, FONT_SCAN_PAGE_LIMIT)
        for (let start = 1; start <= limit; start += FONT_SCAN_BATCH) {
          const end = Math.min(start + FONT_SCAN_BATCH - 1, limit)
          const batch = await Promise.all(
            Array.from({ length: end - start + 1 }, (_, i) => pdfDoc.getPage(start + i)),
          )
          for (const page of batch) {
            try {
              const opList = await page.getOperatorList()
              collectFonts(page, opList, OPS.setFont, map)
            } catch {
              // 单页取字体失败：忽略
            }
          }
          if (map.size >= FONT_LIST_LIMIT) break
          if (cancelled) return
        }
        if (cancelled) return
        const list = [...map.values()].slice(0, FONT_LIST_LIMIT)
        fontsCache.current = { pdfDoc, fonts: list }
        setFonts(list)
        setFontsState('done')
      } catch {
        if (!cancelled) setFontsState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, pdfDoc, totalPages])

  const fontPreview =
    fonts.length > 0
      ? fonts
          .slice(0, FONT_PREVIEW_LIMIT)
          .map((font) => font.name)
          .join(', ')
      : undefined

  return {
    fonts,
    fontsState,
    fontPreview,
    fontModalOpen,
    openFontModal: () => setFontModalOpen(true),
    closeFontModal: () => setFontModalOpen(false),
    showMore: fonts.length > FONT_PREVIEW_LIMIT,
    totalFonts: fonts.length,
  }
}
