import { useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

import { formatBytes } from './loadProgress'
import { MAX_PRECISE_METADATA_BYTES } from './pdfMeta'
import { measureMetadataBytesAsync } from './pdfMetaClient'

interface UsePerPageSizeOptions {
  /** 原始文件；缺省则不计算 */
  file: File | null | undefined
  /** 总页数（由调用方算好传入） */
  totalPages: number
  isOpen: boolean
}

/**
 * 平均每页占用：`(文件字节数 − 元数据字节数) / 总页数`。
 *
 * - 仅在 `isOpen` 时计算，并先让出主线程让弹窗渲染；
 * - 元数据解析放在 Web Worker；超大文件（> 128MB）跳过精确解析、按 `文件大小 / 页数` 估算；
 * - 结果按 `File` 缓存。
 */
export function usePerPageSize({ file, totalPages, isOpen }: UsePerPageSizeOptions) {
  const { t } = useTranslation()
  const [perPage, setPerPage] = useState<number | null>(null)
  const [perPageState, setPerPageState] = useState<'idle' | 'calculating' | 'done' | 'error'>(
    'idle',
  )
  const perPageCache = useRef<{ file: File; perPage: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (!file || totalPages <= 0) {
      setPerPage(null)
      setPerPageState('idle')
      return
    }
    if (perPageCache.current?.file === file) {
      setPerPage(perPageCache.current.perPage)
      setPerPageState('done')
      return
    }

    let cancelled = false
    setPerPageState('calculating')
    void (async () => {
      try {
        // 让出主线程：先渲染弹窗，再做解码/扫描
        await new Promise((resolve) => setTimeout(resolve, 0))
        // 仅对不太大的文件读取原始字节做精确解析；超大文件直接按 文件大小 / 页数 估算，
        // 避免打开弹窗时读取/解码上百 MB。
        let metadataBytes = 0
        if (file.size <= MAX_PRECISE_METADATA_BYTES) {
          const buffer = await file.arrayBuffer()
          if (cancelled) return
          metadataBytes = await measureMetadataBytesAsync(buffer)
        }
        const value = Math.max(0, file.size - metadataBytes) / totalPages
        perPageCache.current = { file, perPage: value }
        if (!cancelled) {
          setPerPage(value)
          setPerPageState('done')
        }
      } catch {
        if (!cancelled) setPerPageState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, file, totalPages])

  const perPageText =
    perPageState === 'calculating'
      ? t('modal.calculating')
      : perPageState === 'done' && perPage != null
        ? formatBytes(perPage)
        : t('modal.unknown')

  return { perPage, perPageState, perPageText }
}
