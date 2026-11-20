/**
 * 注解数据模型与纯函数。
 *
 * pdf.js 的 `page.getAnnotations()` 返回的字段很原始（`contentsObj`、`titleObj`、
 * PDF 日期字符串等），这里把它们归一成面板可以直接渲染的结构。
 */

/** 面板展示范围 */
export type AnnotationScope = 'current' | 'all'

/** 归一化后的注解条目 */
export interface AnnotationListItem {
  /** 注解 id（pdf.js 返回的原始 id，如 "7R"） */
  id: string
  /** 注解在页面 /Annots 数组中的索引（用于 pdf-lib 精确定位） */
  index: number
  /** 0-based 页索引 */
  pageIndex: number
  /** 1-based 页码 */
  pageNumber: number
  /** PDF 注解子类型，如 `Highlight` / `Text` / `FreeText` */
  subtype: string
  /** Text 注解的图标名（Comment / Key / Help / Note / ...） */
  icon?: string
  /** PDF 坐标下的矩形 `[x1, y1, x2, y2]`（原点左下角） */
  rect?: [number, number, number, number]
  /** 文字内容（便签、自由文本、高亮说明等） */
  contents: string
  /** 作者 */
  author: string
  /** PDF 日期字符串（创建时间） */
  creationDate?: string
  /** PDF 日期字符串（修改时间） */
  modificationDate?: string
  /** `#rrggbb`，用于列表左侧色条 */
  color?: string
  /** 是否可被 pdf.js 编辑器编辑 */
  isEditable: boolean
}

/** pdf.js 返回的注解原始结构（只声明我们用到的字段） */
export interface RawPdfAnnotation {
  id?: string | number
  subtype?: string
  icon?: string
  name?: string
  contentsObj?: unknown
  contents?: unknown
  titleObj?: unknown
  title?: unknown
  creationDate?: string
  modificationDate?: string
  color?: unknown
  rect?: unknown
  isEditable?: boolean
  [key: string]: unknown
}

/** 从 `contentsObj` / `contents` 中取出纯文本 */
function readText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'str' in value) {
    const str = (value as { str?: unknown }).str
    return typeof str === 'string' ? str : ''
  }
  return ''
}

/** 把 pdf.js 的 `[r, g, b]`（0..1）颜色转成 `#rrggbb` */
function readColor(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined
  const channels = value.slice(0, 3).map((channel) => {
    const n = Number(channel)
    if (!Number.isFinite(n)) return 0
    const clamped = Math.min(1, Math.max(0, n))
    return Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

function readRect(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  const nums = value.slice(0, 4).map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return undefined
  return [nums[0], nums[1], nums[2], nums[3]]
}

/** 把原始注解数据归一成面板条目 */
export function normalizeAnnotation(
  data: RawPdfAnnotation,
  pageIndex: number,
  index: number,
): AnnotationListItem {
  const contents = readText(data.contentsObj) || readText(data.contents)
  const author = readText(data.titleObj) || readText(data.title)

  return {
    id: String(data.id ?? ''),
    index,
    pageIndex,
    pageNumber: pageIndex + 1,
    subtype: String(data.subtype ?? 'Unknown'),
    icon:
      typeof data.icon === 'string'
        ? data.icon
        : typeof data.name === 'string'
          ? data.name
          : undefined,
    rect: readRect(data.rect),
    contents,
    author,
    creationDate: data.creationDate,
    modificationDate: data.modificationDate,
    color: readColor(data.color),
    isEditable: data.isEditable === true,
  }
}

/**
 * 过滤掉不适合出现在注解面板里的类型。
 *
 * - `Popup` 是其它注解的附属弹窗，不单独展示；
 * - `Widget` 是表单控件，属于表单而不是批注。
 */
export function filterAnnotations(items: AnnotationListItem[]): AnnotationListItem[] {
  return items.filter((item) => item.subtype !== 'Popup' && item.subtype !== 'Widget')
}

/** 按页码、创建时间排序；无日期的排在后面 */
export function sortAnnotations(items: AnnotationListItem[]): AnnotationListItem[] {
  return [...items].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber
    const left = a.creationDate ?? ''
    const right = b.creationDate ?? ''
    if (left === right) return 0
    return left < right ? -1 : 1
  })
}

/** 子类型 → i18n key（用于列表标题 / 无内容时的占位文案） */
export function annotationTypeLabelKey(subtype: string): string {
  const key = ANNOTATION_TYPE_KEYS[subtype]
  return key ?? 'annotationEditor.typeUnknown'
}

const ANNOTATION_TYPE_KEYS: Record<string, string> = {
  Text: 'annotationEditor.typeText',
  FreeText: 'annotationEditor.typeFreeText',
  Highlight: 'annotationEditor.typeHighlight',
  Ink: 'annotationEditor.typeInk',
  Stamp: 'annotationEditor.typeStamp',
  FileAttachment: 'annotationEditor.typeFileAttachment',
  Link: 'annotationEditor.typeLink',
  Square: 'annotationEditor.typeSquare',
  Circle: 'annotationEditor.typeCircle',
  Line: 'annotationEditor.typeLine',
  Polyline: 'annotationEditor.typePolyline',
  Polygon: 'annotationEditor.typePolygon',
  Caret: 'annotationEditor.typeCaret',
  Sound: 'annotationEditor.typeSound',
  Movie: 'annotationEditor.typeMovie',
  Screen: 'annotationEditor.typeScreen',
  PrinterMark: 'annotationEditor.typePrinterMark',
  Watermark: 'annotationEditor.typeWatermark',
}

/** Text 注解图标名 → i18n key（图标选择器的 tooltip） */
export function annotationIconLabelKey(name: string): string {
  return ICON_LABEL_KEYS[name] ?? 'annotationEditor.iconComment'
}

const ICON_LABEL_KEYS: Record<string, string> = {
  Comment: 'annotationEditor.iconComment',
  Note: 'annotationEditor.iconNote',
  Help: 'annotationEditor.iconHelp',
  Key: 'annotationEditor.iconKey',
  NewParagraph: 'annotationEditor.iconNewParagraph',
  Paragraph: 'annotationEditor.iconParagraph',
  Insert: 'annotationEditor.iconInsert',
  Paperclip: 'annotationEditor.iconPaperclip',
  PushPin: 'annotationEditor.iconPushPin',
  Check: 'annotationEditor.iconCheck',
}

/** 取注解的主展示文本：有内容用内容，否则用类型名 */
export function annotationDisplayText(item: AnnotationListItem, typeLabel: string): string {
  return item.contents.trim() || typeLabel
}
