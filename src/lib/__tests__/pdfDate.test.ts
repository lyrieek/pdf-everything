import { describe, it, expect } from 'vitest'

import { PANEL_DATE_FORMAT, formatDate, formatPdfDate, parsePdfDate } from '../pdfDate'

describe('PANEL_DATE_FORMAT', () => {
  it('是有效的 Intl.DateTimeFormatOptions', () => {
    // 能构造出格式化器即说明选项合法
    expect(() => new Intl.DateTimeFormat('en', PANEL_DATE_FORMAT)).not.toThrow()
    expect(PANEL_DATE_FORMAT.year).toBe('numeric')
    expect(PANEL_DATE_FORMAT.hour12).toBe(false)
  })
})

describe('formatPdfDate', () => {
  it('空值原样返回', () => {
    expect(formatPdfDate(undefined)).toBeUndefined()
    expect(formatPdfDate('')).toBe('')
  })

  it('匹配 D:YYYYMMDDHHmmSS 时按 PANEL_DATE_FORMAT + locale 格式化', () => {
    const expected = new Intl.DateTimeFormat('en', PANEL_DATE_FORMAT).format(
      new Date(2024, 0, 1, 0, 0, 0),
    )
    expect(formatPdfDate('D:20240101000000', 'en')).toBe(expected)
  })

  it('时区后缀被忽略，按字面时间展示', () => {
    const withTz = formatPdfDate("D:20240101000000+08'00'", 'en')
    const noTz = formatPdfDate('D:20240101000000', 'en')
    expect(withTz).toBe(noTz)
  })

  it('仅日期（无时间）也能格式化，时间补零', () => {
    const expected = new Intl.DateTimeFormat('zh', PANEL_DATE_FORMAT).format(
      new Date(2024, 0, 1, 0, 0, 0),
    )
    expect(formatPdfDate('D:20240101', 'zh')).toBe(expected)
  })

  it('不同语言产出不同格式', () => {
    expect(formatPdfDate('D:20240101000000', 'en')).not.toBe(
      formatPdfDate('D:20240101000000', 'zh'),
    )
  })

  it('不匹配 PDF 日期格式时原样返回', () => {
    expect(formatPdfDate('2024-01-01', 'en')).toBe('2024-01-01')
    expect(formatPdfDate('昨天 12:00', 'zh')).toBe('昨天 12:00')
  })

  it('数值越界时原样返回，不强行格式化', () => {
    expect(formatPdfDate('D:20241301000000', 'en')).toBe('D:20241301000000') // 13 月
    expect(formatPdfDate('D:20240132000000', 'en')).toBe('D:20240132000000') // 32 日
    expect(formatPdfDate('D:20240101250000', 'en')).toBe('D:20240101250000') // 25 时
  })
})

describe('parsePdfDate', () => {
  it('解析合法 PDF 日期（按本地时间构造）', () => {
    const date = parsePdfDate('D:20240102030405')
    expect(date).toBeInstanceOf(Date)
    expect(date?.getFullYear()).toBe(2024)
    expect(date?.getMonth()).toBe(0)
    expect(date?.getDate()).toBe(2)
    expect(date?.getHours()).toBe(3)
    expect(date?.getMinutes()).toBe(4)
    expect(date?.getSeconds()).toBe(5)
  })

  it('空值 / 非 PDF 格式 / 越界返回 null', () => {
    expect(parsePdfDate(undefined)).toBeNull()
    expect(parsePdfDate('')).toBeNull()
    expect(parsePdfDate('2024-01-01')).toBeNull()
    expect(parsePdfDate('D:20241301000000')).toBeNull()
  })

  it('formatDate 直接格式化 Date', () => {
    const date = parsePdfDate('D:20240101000000')
    expect(date).not.toBeNull()
    expect(formatDate(date as Date, 'en')).toBe(
      new Intl.DateTimeFormat('en', PANEL_DATE_FORMAT).format(date as Date),
    )
  })
})
