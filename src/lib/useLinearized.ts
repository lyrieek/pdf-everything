import { useEffect, useRef, useState } from 'preact/hooks'

import { LINEARIZED_SCAN_BYTES, detectLinearized } from './pdfMeta'

interface UseLinearizedOptions {
  /** 原始文件；缺省则不计算 */
  file: File | null | undefined
  isOpen: boolean
}

/**
 * 线性化（Fast Web View）检测：只读取文件头部几 KB 扫描 `/Linearized` 字典。
 *
 * - 仅在 `isOpen` 时检测；
 * - 结果按 `File` 缓存。
 */
export function useLinearized({ file, isOpen }: UseLinearizedOptions) {
  const [linearized, setLinearized] = useState<boolean | null>(null)
  const [linearizedState, setLinearizedState] = useState<'idle' | 'calculating' | 'done' | 'error'>(
    'idle',
  )
  const cache = useRef<{ file: File; linearized: boolean } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (!file) {
      setLinearized(null)
      setLinearizedState('idle')
      return
    }
    if (cache.current?.file === file) {
      setLinearized(cache.current.linearized)
      setLinearizedState('done')
      return
    }

    let cancelled = false
    setLinearizedState('calculating')
    void (async () => {
      try {
        const head = await file.slice(0, LINEARIZED_SCAN_BYTES).arrayBuffer()
        if (cancelled) return
        const value = detectLinearized(head)
        cache.current = { file, linearized: value }
        setLinearized(value)
        setLinearizedState('done')
      } catch {
        if (!cancelled) setLinearizedState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, file])

  return { linearized, linearizedState }
}
