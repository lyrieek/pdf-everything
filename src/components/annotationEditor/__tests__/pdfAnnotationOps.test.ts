import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import {
  addTextAnnotation,
  deleteAnnotation,
  loadPdfBytes,
  updateAnnotation,
  updateAnnotationIcon,
  updateAnnotationRect,
} from '../pdfAnnotationOps'
import { ENCRYPTED_PDF, EncryptedPdfError } from '../pdfAnnotationOps'

const PAGE_WIDTH = 600
const PAGE_HEIGHT = 800

/** 造一份带一条 Text 注解的最小 PDF */
async function createPdfWithTextAnnotation(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const annots = PDFArray.withContext(doc.context)
  annots.push(
    doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect: [100, 100, 120, 120],
        Contents: PDFString.of('hello'),
        T: PDFString.of('Alice'),
        Name: PDFName.of('Comment'),
        NM: PDFString.of('note-1'),
      }),
    ),
  )
  page.node.set(PDFName.of('Annots'), annots)
  return doc.save()
}

function getAnnots(doc: PDFDocument, pageNumber = 1): PDFArray {
  const page = doc.getPage(pageNumber - 1)
  const ref = page.node.get(PDFName.of('Annots'))
  const resolved = doc.context.lookup(ref)
  if (!(resolved instanceof PDFArray)) throw new Error('no annots')
  return resolved
}

function getAnnotationDict(doc: PDFDocument, index: number): PDFDict {
  const annots = getAnnots(doc)
  const resolved = doc.context.lookup(annots.get(index))
  if (!(resolved instanceof PDFDict)) throw new Error('no annotation dict')
  return resolved
}

describe('updateAnnotation', () => {
  it('更新 Contents / T / ModDate', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await updateAnnotation(doc, 1, 0, { contents: 'updated', author: 'Bob' })

    const dict = getAnnotationDict(doc, 0)
    expect(dict.get(PDFName.of('Contents'))?.toString()).toBe('(updated)')
    expect(dict.get(PDFName.of('T'))?.toString()).toBe('(Bob)')
    expect(dict.get(PDFName.of('ModDate'))).toBeDefined()
  })

  it('只更新 author 时不动 Contents', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await updateAnnotation(doc, 1, 0, { author: 'Carol' })

    const dict = getAnnotationDict(doc, 0)
    expect(dict.get(PDFName.of('Contents'))?.toString()).toBe('(hello)')
    expect(dict.get(PDFName.of('T'))?.toString()).toBe('(Carol)')
  })

  it('索引越界时不抛错也不修改', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await expect(updateAnnotation(doc, 1, 99, { contents: 'x' })).resolves.toBeUndefined()
    expect(getAnnotationDict(doc, 0).get(PDFName.of('Contents'))?.toString()).toBe('(hello)')
  })
})

describe('updateAnnotationIcon', () => {
  it('写入 Text 注解的 /Name', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await updateAnnotationIcon(doc, 1, 0, 'Key')

    expect(getAnnotationDict(doc, 0).get(PDFName.of('Name'))?.toString()).toBe('/Key')
  })
})

describe('updateAnnotationRect', () => {
  it('写入新的 /Rect', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await updateAnnotationRect(doc, 1, 0, [10, 20, 30, 40])

    const rect = getAnnotationDict(doc, 0).get(PDFName.of('Rect'))
    expect(rect?.toString()).toBe('[ 10 20 30 40 ]')
  })
})

describe('deleteAnnotation', () => {
  it('从 /Annots 中移除指定下标', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    expect(getAnnots(doc).size()).toBe(1)

    await deleteAnnotation(doc, 1, 0)
    expect(getAnnots(doc).size()).toBe(0)
  })

  it('索引越界时安全返回', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await expect(deleteAnnotation(doc, 1, 99)).resolves.toBeUndefined()
    expect(getAnnots(doc).size()).toBe(1)
  })
})

describe('addTextAnnotation', () => {
  it('追加一条带 Comment 图标的 Text 注解', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await addTextAnnotation(doc, 1, {
      contents: 'brand new',
      author: 'DeepSeek',
      rect: [50, 60, 70, 80],
    })

    const annots = getAnnots(doc)
    expect(annots.size()).toBe(2)
    const added = doc.context.lookup(annots.get(1))
    expect(added).toBeInstanceOf(PDFDict)
    const dict = added as PDFDict
    expect(dict.get(PDFName.of('Subtype'))?.toString()).toBe('/Text')
    expect(dict.get(PDFName.of('Name'))?.toString()).toBe('/Comment')
    expect(dict.get(PDFName.of('Contents'))?.toString()).toBe('(brand new)')
    expect(dict.get(PDFName.of('T'))?.toString()).toBe('(DeepSeek)')
    expect(dict.get(PDFName.of('Rect'))?.toString()).toBe('[ 50 60 70 80 ]')
  })

  it('未给 rect 时放在页面中心且不越界', async () => {
    const doc = await PDFDocument.load(await createPdfWithTextAnnotation())
    await addTextAnnotation(doc, 1, { contents: 'center' })

    const annots = getAnnots(doc)
    const dict = doc.context.lookup(annots.get(1)) as PDFDict
    const rect = dict.get(PDFName.of('Rect'))?.toString() ?? ''
    expect(rect).toBe('[ 290 390 310 410 ]')
  })
})

describe('loadPdfBytes', () => {
  it('把 pdf-lib 的加密异常映射为稳定错误码', async () => {
    const spy = vi
      .spyOn(PDFDocument, 'load')
      .mockRejectedValue(new Error('Input document to PDFDocument.load is encrypted.'))
    try {
      const error = await loadPdfBytes(new Uint8Array([1, 2, 3])).catch((err: unknown) => err)
      expect(error).toBeInstanceOf(EncryptedPdfError)
      expect(error).toMatchObject({ message: ENCRYPTED_PDF })
    } finally {
      spy.mockRestore()
    }
  })

  it('其他错误原样抛出', async () => {
    const spy = vi.spyOn(PDFDocument, 'load').mockRejectedValueOnce(new Error('boom'))
    try {
      await expect(loadPdfBytes(new Uint8Array([1]))).rejects.toThrow('boom')
    } finally {
      spy.mockRestore()
    }
  })
})
