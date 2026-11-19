/**
 * 属性面板里的日期格式化（纯函数，不依赖 DOM / pdf.js，便于单测）。
 *
 * 只有当字符串符合 PDF 日期格式（`D:YYYYMMDDHHmmSS…`）时才格式化；
 * 否则原样返回，避免把已经是人类可读的字符串改坏。
 */

/**
 * 属性面板展示「创建时间 / 修改时间」时使用的格式。
 *
 * 交给 `Intl.DateTimeFormat` 使用，语言由调用方按当前界面语言传入。
 * 需要调整面板日期样式时，只改这一处即可。
 */
export const PANEL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

/**
 * 匹配完整的 PDF 日期字符串：
 * `D:` + 年(4) 月(2) 日(2) + 可选的 时(2) 分(2) 秒(2) + 可选时区(`Z` / `±HH'mm'`)。
 *
 * 时区允许存在但被忽略，按字面时间展示（属性面板通常展示文件里写的本地时间）。
 */
const PDF_DATE_RE = /^D:(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})?(\d{2})?)?(?:Z|[+-]\d{2}'?\d{2}'?)?$/

/**
 * 把 PDF 日期字符串解析为 `Date`；无法解析（空值 / 不匹配 / 数值越界）返回 null。
 * 时区后缀被忽略，按字面时间构造（属性面板通常展示文件里写的本地时间）。
 */
export function parsePdfDate(value?: string): Date | null {
  if (!value) return null
  const m = PDF_DATE_RE.exec(value)
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = m[4] ? Number(m[4]) : 0
  const minute = m[5] ? Number(m[5]) : 0
  const second = m[6] ? Number(m[6]) : 0

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null
  }

  // 用 setFullYear 而非 new Date(year, ...)，避免 0–99 年被当成 19xx
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, second, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 按 `PANEL_DATE_FORMAT` 与 locale 格式化一个 Date（不校验，调用方保证有效） */
export function formatDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, PANEL_DATE_FORMAT).format(date)
}

/**
 * 把 PDF 日期字符串格式化为本地化的可读时间。
 *
 * - 空值 → 原样返回；
 * - 不匹配 `D:YYYYMMDD…`（含数值越界，如 13 月）→ 原样返回，不强行格式化；
 * - 匹配 → 按 `PANEL_DATE_FORMAT` 与 `locale` 输出。
 *
 * @param value 原始字符串（来自 PDF Info 字典的 `CreationDate` / `ModDate`）
 * @param locale BCP 47 语言标签，如 `'zh'` / `'en'`；缺省用运行环境默认语言
 */
export function formatPdfDate(value?: string, locale?: string): string | undefined {
  if (!value) return value
  const date = parsePdfDate(value)
  return date ? formatDate(date, locale) : value
}
