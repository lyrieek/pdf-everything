import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'

export type PdfColor = [number, number, number]

export interface AddTextAnnotationParams {
  contents?: string
  author?: string
  /** PDF 坐标（原点左下角），省略时放在页面中心 */
  rect?: [number, number, number, number]
  color?: PdfColor
}

export interface EditAnnotationParams {
  contents?: string
  author?: string
}

function nowPdfDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}Z`
}

/** 取页面的 /Annots 数组，没有则新建一个空数组并挂到页节点上 */
export function findPageAnnotations(doc: PDFDocument, pageNumber: number): PDFArray {
  const page = doc.getPage(pageNumber - 1)
  const node = page.node
  const existing = node.get(PDFName.of('Annots'))
  if (existing) {
    const resolved = doc.context.lookup(existing)
    if (resolved instanceof PDFArray) return resolved
  }
  const arr = PDFArray.withContext(doc.context)
  node.set(PDFName.of('Annots'), arr)
  return arr
}

/**
 * 取指定下标的注解字典。
 *
 * `/Annots` 里的元素通常是引用，但也可能是内联字典；统一用 `context.lookup`
 * 解析，避免只处理 `PDFRef` 而漏掉内联对象。
 */
function getAnnotationDict(doc: PDFDocument, annots: PDFArray, index: number): PDFDict | null {
  if (index < 0 || index >= annots.size()) return null
  const item = annots.get(index)
  const resolved = doc.context.lookup(item)
  return resolved instanceof PDFDict ? resolved : null
}

/** 新增文本注解（便签），默认放在页面中心 */
export async function addTextAnnotation(
  doc: PDFDocument,
  pageNumber: number,
  params: AddTextAnnotationParams,
): Promise<void> {
  const page = doc.getPage(pageNumber - 1)
  const { width, height } = page.getSize()
  const size = 20
  const [x1, y1, x2, y2] = params.rect ?? [
    width / 2 - size / 2,
    height / 2 - size / 2,
    width / 2 + size / 2,
    height / 2 + size / 2,
  ]
  const now = new Date()
  const date = nowPdfDate(now)
  const dict = doc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Text'),
    Rect: [x1, y1, x2, y2],
    Contents: PDFString.of(params.contents ?? ''),
    T: PDFString.of(params.author ?? ''),
    NM: PDFString.of(`annot-${now.getTime()}`),
    Name: PDFName.of('Comment'),
    CreationDate: PDFString.of(date),
    ModDate: PDFString.of(date),
    C: params.color ?? [1, 1, 0],
    Open: false,
    F: 4,
  })
  const ref = doc.context.register(dict)
  findPageAnnotations(doc, pageNumber).push(ref)
}

/** 删除指定页面的指定注解（按 /Annots 数组下标） */
export async function deleteAnnotation(
  doc: PDFDocument,
  pageNumber: number,
  index: number,
): Promise<void> {
  const annots = findPageAnnotations(doc, pageNumber)
  if (index < 0 || index >= annots.size()) return
  annots.remove(index)
}

/** 编辑指定注解的 contents / author（按 /Annots 数组下标） */
export async function updateAnnotation(
  doc: PDFDocument,
  pageNumber: number,
  index: number,
  params: EditAnnotationParams,
): Promise<void> {
  const annots = findPageAnnotations(doc, pageNumber)
  const dict = getAnnotationDict(doc, annots, index)
  if (!dict) return

  if (params.contents !== undefined) {
    dict.set(PDFName.of('Contents'), PDFString.of(params.contents))
  }
  if (params.author !== undefined) {
    dict.set(PDFName.of('T'), PDFString.of(params.author))
  }
  dict.set(PDFName.of('ModDate'), PDFString.of(nowPdfDate()))
}

/** 加密 PDF 的稳定错误码，供 UI 翻译成友好提示 */
export const ENCRYPTED_PDF = 'ENCRYPTED_PDF'

export class EncryptedPdfError extends Error {
  constructor() {
    super(ENCRYPTED_PDF)
    this.name = 'EncryptedPdfError'
  }
}

/** 更新指定注解的位置（按 /Annots 数组下标） */
export async function updateAnnotationRect(
  doc: PDFDocument,
  pageNumber: number,
  index: number,
  rect: [number, number, number, number],
): Promise<void> {
  const annots = findPageAnnotations(doc, pageNumber)
  const dict = getAnnotationDict(doc, annots, index)
  if (!dict) return
  dict.set(PDFName.of('Rect'), doc.context.obj(rect))
  dict.set(PDFName.of('ModDate'), PDFString.of(nowPdfDate()))
}

/** 更新 Text 注解的图标（写入 `/Name`） */
export async function updateAnnotationIcon(
  doc: PDFDocument,
  pageNumber: number,
  index: number,
  name: string,
): Promise<void> {
  const annots = findPageAnnotations(doc, pageNumber)
  const dict = getAnnotationDict(doc, annots, index)
  if (!dict) return
  dict.set(PDFName.of('Name'), PDFName.of(name))
  dict.set(PDFName.of('ModDate'), PDFString.of(nowPdfDate()))
}

/** 从字节数组加载 PDFDocument（供 pdf-lib 修改） */
export async function loadPdfBytes(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes)
  } catch (err) {
    // pdf-lib 无法安全修改加密文档（会破坏 Encrypt 字典与流），
    // 收敛成稳定错误码，UI 据此提示并禁用编辑。
    if (err instanceof Error && /encrypt/i.test(err.message)) {
      throw new EncryptedPdfError()
    }
    throw err
  }
}

/** 保存 PDFDocument 为字节数组 */
export async function saveDocument(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save()
}
