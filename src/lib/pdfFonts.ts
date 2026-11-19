/**
 * PDF 字体提取（纯函数，便于单测）。
 *
 * pdf.js 的 `page.getOperatorList()` 返回 `fnArray` / `argsArray`；其中 `setFont`
 * 操作的第 0 个参数是字体资源名（实际是 pdf.js 的 `loadedName`），用 `page.commonObjs.get(name)` 取到字体对象：
 * - `name`：PDF 里的真实字体名（BaseFont，如 `ABCDEF+Arial-BoldMT`）。
 *   注意：只有在 `getDocument` 时开启 `fontExtraProperties: true` 才会导出该字段；
 * - `loadedName`：pdf.js 合成的 CSS 名（如 `g_d1_f1`），仅在拿不到 `name` 时兜底；
 * - `data`：嵌入字体文件字节（存在即视为嵌入）；`missingFile` 表示字体文件缺失。
 */

export interface PdfFont {
  /** 可读字体名（优先取 PDF 的 BaseFont，如 ABCDEF+Arial-BoldMT） */
  name: string
  /** 是否为嵌入字体（PDF 内嵌字体文件） */
  embedded: boolean
  /** 是否为子集化字体（BaseFont 以 6 个大写字母 + "+" 开头） */
  subset: boolean
}

export interface FontPageLike {
  commonObjs: { get(id: string): unknown }
}

export interface FontOperatorListLike {
  fnArray: number[]
  argsArray: unknown[][]
}

interface FontLike {
  /** PDF 的 BaseFont 名（需 fontExtraProperties: true） */
  name?: unknown
  loadedName?: unknown
  data?: unknown
  missingFile?: unknown
}

/** 子集字体的 BaseFont 前缀：6 个大写字母 + "+"（PDF 规范） */
const SUBSET_PREFIX = /^[A-Z]{6}\+/

function isEmbedded(font: FontLike): boolean {
  if (font.missingFile) return false
  const data = font.data
  if (data == null) return false
  // 某些字体可能是空数组
  return !(typeof data === 'object' && (data as { length?: number }).length === 0)
}

function isSubset(name: string): boolean {
  return SUBSET_PREFIX.test(name)
}

/**
 * 从一页的操作列表中收集字体，加入 `into`（按字体名去重）。
 * 未解析 / 无字体名 / 非 setFont 操作会被忽略。
 */
export function collectFonts(
  page: FontPageLike,
  opList: FontOperatorListLike,
  setFontOp: number,
  into: Map<string, PdfFont>,
): void {
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] !== setFontOp) continue

    const fontRef = opList.argsArray[i]?.[0]
    if (typeof fontRef !== 'string') continue

    try {
      const font = page.commonObjs.get(fontRef) as FontLike | null
      // 优先真实 BaseFont；缺失时回退到 pdf.js 合成名
      const rawName = font?.name
      const name =
        typeof rawName === 'string' && rawName
          ? rawName
          : typeof font?.loadedName === 'string'
            ? font.loadedName
            : ''
      if (!name || into.has(name)) continue
      into.set(name, { name, embedded: isEmbedded(font ?? {}), subset: isSubset(name) })
    } catch {
      // 字体尚未解析（或对象不存在）时忽略
    }
  }
}
