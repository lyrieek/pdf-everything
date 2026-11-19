/**
 * 页面尺寸：把 PDF 页面尺寸格式化为可读文本，识别标准尺寸，并支持 pt / mm 双单位。
 *
 * 纯函数，不依赖 DOM / pdf.js，便于单测。调用方传入 `getViewport({ scale: 1 })`
 * 得到的宽高（单位：pt，1pt = 25.4/72 mm）。
 */

export interface PageSize {
  width: number
  height: number
}

/** 一种尺寸 + 一个代表页（1-based） */
export interface SizeGroup {
  size: PageSize
  page: number
}

/** 标准尺寸（pt），同时支持横向（宽高互换）匹配 */
const STANDARD_SIZES: ReadonlyArray<{ label: string; width: number; height: number }> = [
  { label: 'A3', width: 842, height: 1191 },
  { label: 'A4', width: 595, height: 842 },
  { label: 'A5', width: 420, height: 595 },
  { label: 'PA5', width: 397, height: 595 },
  { label: 'B4', width: 729, height: 1032 },
  { label: 'B5', width: 516, height: 729 },
  { label: 'Letter', width: 612, height: 792 },
  { label: 'Legal', width: 612, height: 1008 },
]

/** 尺寸匹配/全等判定的容差（pt）。PDF 尺寸常带小数，完全相同几乎不存在 */
export const SIZE_TOLERANCE = 2

function close(a: number, b: number, tolerance = SIZE_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance
}

/** 两个尺寸是否可视为相同（用于「所有页尺寸是否一致」判定） */
export function isSameSize(a: PageSize, b: PageSize, tolerance = SIZE_TOLERANCE): boolean {
  return close(a.width, b.width, tolerance) && close(a.height, b.height, tolerance)
}

/** 命中标准尺寸则返回其标签（A3/A4/A5/B4/B5/Letter/Legal），否则返回 null */
export function matchStandardSize(size: PageSize): string | null {
  for (const standard of STANDARD_SIZES) {
    if (close(size.width, standard.width) && close(size.height, standard.height)) {
      return standard.label
    }
    // 横向：宽高互换后仍匹配
    if (close(size.width, standard.height) && close(size.height, standard.width)) {
      return standard.label
    }
  }
  return null
}

/** `595 × 842 pt` */
export function formatPt(size: PageSize): string {
  return `${Math.round(size.width)} × ${Math.round(size.height)} pt`
}

/** `210 × 297 mm`（四舍五入到整数 mm） */
export function formatMm(size: PageSize): string {
  return `${Math.round((size.width * 25.4) / 72)} × ${Math.round((size.height * 25.4) / 72)} mm`
}

/**
 * 格式化页面尺寸：
 * - 命中标准尺寸：`595 × 842 pt (A4)`；
 * - 未命中且提供 `approxLabel`：`800 × 1000 pt（约 282 × 353 mm）`（用本地化词分隔，避免符号歧义）；
 * - 未命中且无 `approxLabel`：`800 × 1000 pt / 282 × 353 mm`。
 */
export function formatPageSize(size: PageSize, approxLabel?: string): string {
  const pt = formatPt(size)
  const label = matchStandardSize(size)
  if (label) return `${pt} (${label})`
  const mm = formatMm(size)
  return approxLabel ? `${pt}（${approxLabel} ${mm}）` : `${pt} / ${mm}`
}

/** 始终双单位（用于尺寸明细弹窗）：`595 × 842 pt (A4)（约 210 × 297 mm）` */
export function formatPageSizeBoth(size: PageSize, approxLabel: string): string {
  const pt = formatPt(size)
  const label = matchStandardSize(size)
  const head = label ? `${pt} (${label})` : pt
  return `${head}（${approxLabel} ${formatMm(size)}）`
}

/**
 * 把「页 → 尺寸」序列按尺寸分组（容差内视为同一种），每组保留一个代表页。
 * 最多返回 `maxGroups` 种（默认 10）。`allSame` 表示所有页尺寸是否一致。
 */
export function groupPageSizes(
  entries: ReadonlyArray<{ page: number; size: PageSize }>,
  maxGroups = 10,
): { allSame: boolean; groups: SizeGroup[] } {
  const groups: SizeGroup[] = []
  let firstSize: PageSize | null = null
  let allSame = true

  for (const { page, size } of entries) {
    if (!firstSize) {
      firstSize = size
      groups.push({ size, page })
      continue
    }
    if (!isSameSize(firstSize, size)) allSame = false
    if (groups.length < maxGroups && !groups.some((g) => isSameSize(g.size, size))) {
      groups.push({ size, page })
    }
  }

  return { allSame, groups }
}
