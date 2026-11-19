import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type * as pdfjsLib from 'pdfjs-dist'

import {
  formatPageSize,
  groupPageSizes,
  isSameSize,
  type PageSize,
  type SizeGroup,
} from './pageSize'

interface UsePageSizesOptions {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  pages: pdfjsLib.PDFPageProxy[]
  /** 当前阅读页（1-based） */
  currentPage?: number
  /** 总页数（由调用方算好传入） */
  totalPages: number
  isOpen: boolean
}

/** 读取页面在 scale=1 下的尺寸（pt）；失败返回 null */
function toPageSize(page?: pdfjsLib.PDFPageProxy): PageSize | null {
  if (!page) return null
  try {
    const viewport = page.getViewport({ scale: 1 })
    return { width: viewport.width, height: viewport.height }
  } catch {
    return null
  }
}

/**
 * 页面尺寸：当前页尺寸 / 所有页尺寸，以及手动「计算所有页」的扫描逻辑。
 *
 * - 10 页以内且已全部加载、各页尺寸全等 → 自动显示「所有页尺寸」；
 * - 「计算所有页」分批取页（优先用已加载页），一致则覆盖为「所有页尺寸」，
 *   不一致则返回尺寸分组（供调用方弹窗展示）。
 *
 * 只在 `isOpen` 时计算，避免拖慢初始加载。
 */
export function usePageSizes({
  pdfDoc,
  pages,
  currentPage,
  totalPages,
  isOpen,
}: UsePageSizesOptions) {
  const { t } = useTranslation()
  const [allPagesSize, setAllPagesSize] = useState<PageSize | null>(null)
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanIdRef = useRef(0)

  // 换文档时清空手动计算结果
  useEffect(() => {
    setAllPagesSize(null)
    setSizeGroups(null)
    setScanning(false)
    scanIdRef.current++
  }, [pdfDoc])

  // 主弹窗关闭时收起明细，并使进行中的扫描失效
  useEffect(() => {
    if (!isOpen) {
      setSizeGroups(null)
      setScanning(false)
      scanIdRef.current++
    }
  }, [isOpen])

  const pageSizeInfo = useMemo<{ label: string; value?: string }>(() => {
    // 手动「计算所有页」已得出统一尺寸：直接覆盖为「所有页尺寸」
    if (allPagesSize) {
      return {
        label: t('modal.allPagesSize'),
        value: formatPageSize(allPagesSize, t('modal.approx')),
      }
    }
    if (!isOpen) return { label: t('modal.currentPageSize') }

    const safeCurrent = Math.min(Math.max(currentPage ?? 1, 1), Math.max(totalPages, 1))
    const currentSize = toPageSize(pages[safeCurrent - 1])

    if (totalPages > 0 && totalPages <= 10 && pages.length === totalPages) {
      const first = toPageSize(pages[0])
      const allSame =
        !!first &&
        pages.every((page) => {
          const size = toPageSize(page)
          return !!size && isSameSize(size, first)
        })
      if (allSame && first) {
        return { label: t('modal.allPagesSize'), value: formatPageSize(first, t('modal.approx')) }
      }
    }

    return {
      label: t('modal.currentPageSize'),
      value: currentSize ? formatPageSize(currentSize, t('modal.approx')) : undefined,
    }
  }, [isOpen, pages, currentPage, totalPages, t, allPagesSize])

  const pageSize = {
    label: pageSizeInfo.label,
    value: pageSizeInfo.value,
    canCompute: isOpen && !!pdfDoc && pageSizeInfo.label === t('modal.currentPageSize'),
  }

  const computeAll = async () => {
    if (!pdfDoc || scanning) return
    const id = ++scanIdRef.current
    setScanning(true)
    try {
      const entries: Array<{ page: number; size: PageSize }> = []
      const BATCH = 24
      for (let start = 1; start <= totalPages; start += BATCH) {
        const end = Math.min(start + BATCH - 1, totalPages)
        const batch = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) => {
            const n = start + i
            const cached = pages[n - 1]
            return cached ? Promise.resolve(cached) : pdfDoc.getPage(n)
          }),
        )
        for (let i = 0; i < batch.length; i++) {
          const size = toPageSize(batch[i])
          if (size) entries.push({ page: start + i, size })
        }
        // 已凑够 10 种尺寸：足够展示，提前结束（此时 allSame 必为 false）
        if (groupPageSizes(entries).groups.length >= 10) break
        if (id !== scanIdRef.current) return
      }
      if (id !== scanIdRef.current) return

      const result = groupPageSizes(entries)
      if (result.allSame && result.groups.length > 0) {
        setAllPagesSize(result.groups[0].size)
        setSizeGroups(null)
      } else {
        setAllPagesSize(null)
        setSizeGroups(result.groups.length > 0 ? result.groups : null)
      }
    } catch {
      // 扫描失败：保持现状
    } finally {
      if (id === scanIdRef.current) setScanning(false)
    }
  }

  return {
    pageSize,
    sizeGroups,
    scanning,
    computeAll,
    closeBreakdown: () => setSizeGroups(null),
  }
}
