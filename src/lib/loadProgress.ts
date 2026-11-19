/**
 * 加载进度相关的纯函数（不依赖 DOM / pdf.js，便于单测）。
 */

/** 把字节数格式化为人类可读的大小（B / KB / MB / GB） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  const rounded = index === 0 ? Math.round(value) : Number(value.toFixed(1))
  return `${rounded} ${units[index]}`
}

/**
 * 格式化「下载文档」阶段的进度。
 *
 * - `total > 0`：显示百分比（上限 100%）；
 * - `total === 0`（流式传输，未知大小）：降级为已加载字节数。
 */
export function formatLoadProgress(loaded: number, total: number): string {
  if (total > 0) {
    const percent = Math.min(100, Math.round((loaded / total) * 100))
    return `${percent}%`
  }
  return formatBytes(loaded)
}
