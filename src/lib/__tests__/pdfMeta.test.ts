import { describe, it, expect } from 'vitest'

import { measureMetadataBytes, detectLinearized } from '../pdfMeta'

/** 把 latin1 字符串转成字节缓冲区（每字符 1 字节），模拟 PDF 原始字节 */
function toBuffer(text: string): ArrayBuffer {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
  return bytes.buffer
}

const CATALOG = '1 0 obj\n<< /Type /Catalog /Metadata 2 0 R >>\nendobj'
const META_OBJ = '2 0 obj\n<< /Type /Metadata /Length 10 >>\nstream\n<xmp/>\nendstream\nendobj'
const INFO_OBJ = '3 0 obj\n<< /Title (Test) /Author (Me) >>\nendobj'
const TRAILER = 'trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>'

describe('measureMetadataBytes', () => {
  it('累加 Info 字典与 Metadata 流的字节跨度', () => {
    const text = `%PDF-1.7\n${CATALOG}\n${META_OBJ}\n${INFO_OBJ}\n${TRAILER}\n%%EOF`
    const bytes = measureMetadataBytes(toBuffer(text))
    expect(bytes).toBe(META_OBJ.length + INFO_OBJ.length)
  })

  it('没有 Info / Metadata 引用时返回 0', () => {
    const text = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
    expect(measureMetadataBytes(toBuffer(text))).toBe(0)
  })

  it('对象被压进对象流（无顶层 N G obj）时按 0 计', () => {
    // 只有引用，没有对应的顶层对象定义
    const text = 'trailer\n<< /Info 3 0 R /Root 1 0 R >>'
    expect(measureMetadataBytes(toBuffer(text))).toBe(0)
  })

  it('空 buffer 返回 0', () => {
    expect(measureMetadataBytes(new ArrayBuffer(0))).toBe(0)
  })

  it('不会把 N 误匹配到 N1（如 5 不会命中 15 0 obj）', () => {
    // 只有 15 0 obj，却引用 /Info 5 0 R：应找不到 5 0 obj，返回 0
    const text = '15 0 obj\n<< /Title (x) >>\nendobj\ntrailer << /Info 5 0 R >>'
    expect(measureMetadataBytes(toBuffer(text))).toBe(0)
  })
})

describe('detectLinearized', () => {
  it('头部含 /Linearized 字典时返回 true', () => {
    const text = '%PDF-1.7\n1 0 obj\n<< /Linearized 1 /L 12345 /O 5 >>\nendobj'
    expect(detectLinearized(toBuffer(text))).toBe(true)
  })

  it('头部无 /Linearized 时返回 false', () => {
    const text = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
    expect(detectLinearized(toBuffer(text))).toBe(false)
  })

  it('空 buffer 返回 false', () => {
    expect(detectLinearized(new ArrayBuffer(0))).toBe(false)
  })
})
