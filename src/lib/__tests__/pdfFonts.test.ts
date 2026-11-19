import { describe, it, expect } from 'vitest'

import { collectFonts, type PdfFont } from '../pdfFonts'

const SET_FONT = 37

interface FakeFont {
  name?: string
  loadedName: string
  data?: unknown
  missingFile?: boolean
}

describe('collectFonts', () => {
  it('从 setFont 操作收集字体并去重，同时标记是否嵌入与是否子集化', () => {
    const fonts: Record<string, FakeFont> = {
      g_f1: { name: 'Helvetica', loadedName: 'Helvetica', missingFile: true },
      g_f2: { name: 'Arial', loadedName: 'Arial', data: new Uint8Array([1, 2, 3]) },
      g_f3: { name: 'ABCDEF+Helvetica', loadedName: 'g_d1_f3', missingFile: true },
    }
    const map = new Map<string, PdfFont>()
    collectFonts(
      { commonObjs: { get: (id: string) => fonts[id] } },
      {
        fnArray: [SET_FONT, SET_FONT, SET_FONT, 1],
        argsArray: [['g_f1', 12], ['g_f2', 12], ['g_f3', 12], []],
      },
      SET_FONT,
      map,
    )
    expect([...map.values()]).toEqual([
      { name: 'Helvetica', embedded: false, subset: false },
      { name: 'Arial', embedded: true, subset: false },
      { name: 'ABCDEF+Helvetica', embedded: false, subset: true },
    ])
  })

  it('data 为空数组时视为未嵌入，且 name 缺失时回退到 loadedName', () => {
    const map = new Map<string, PdfFont>()
    collectFonts(
      { commonObjs: { get: () => ({ loadedName: 'X', data: new Uint8Array([]) }) } },
      { fnArray: [SET_FONT], argsArray: [['g_f1', 12]] },
      SET_FONT,
      map,
    )
    expect([...map.values()]).toEqual([{ name: 'X', embedded: false, subset: false }])
  })

  it('忽略非 setFont / 未解析 / 非字符串引用', () => {
    const map = new Map<string, PdfFont>()
    collectFonts(
      {
        commonObjs: {
          get: () => {
            throw new Error('not resolved')
          },
        },
      },
      {
        fnArray: [1, SET_FONT, SET_FONT],
        argsArray: [[], ['missing', 12], [123, 12]],
      },
      SET_FONT,
      map,
    )
    expect(map.size).toBe(0)
  })

  it('只收集带 BaseFont 子集前缀的字体标记为子集化', () => {
    const map = new Map<string, PdfFont>()
    collectFonts(
      {
        commonObjs: {
          get: (id: string) => ({
            name: id === 'g_f1' ? 'AAAAAA+Custom' : 'Helvetica',
            loadedName: id,
          }),
        },
      },
      {
        fnArray: [SET_FONT, SET_FONT],
        argsArray: [
          ['g_f1', 12],
          ['g_f2', 12],
        ],
      },
      SET_FONT,
      map,
    )
    expect([...map.values()]).toEqual([
      { name: 'AAAAAA+Custom', embedded: false, subset: true },
      { name: 'Helvetica', embedded: false, subset: false },
    ])
  })
})
