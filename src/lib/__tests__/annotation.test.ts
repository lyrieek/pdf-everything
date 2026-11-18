import { describe, it, expect, vi } from 'vitest'
import { createAnnotationStorage, createDestResolver, createLinkService } from '../annotation'
import type { PDFDocumentProxy } from 'pdfjs-dist'

describe('createAnnotationStorage', () => {
  it('getValue 无存储时返回默认值', () => {
    const storage = createAnnotationStorage()
    const fallback = { value: 'default' }
    expect(storage.getValue('a', fallback)).toEqual({ value: 'default' })
    expect(storage.has('a')).toBe(false)
  })

  it('setValue 后 getValue 合并出已存储的值', () => {
    const storage = createAnnotationStorage()
    storage.setValue('a', { value: 'typed' })
    expect(storage.getValue('a', { value: 'default' })).toMatchObject({ value: 'typed' })
    expect(storage.getRawValue('a')).toMatchObject({ value: 'typed' })
    expect(storage.size).toBe(1)
  })

  it('setValue 同步 formattedValue，避免注解层重建后文本被原值覆盖', () => {
    const storage = createAnnotationStorage()
    storage.setValue('a', { value: 'typed' })
    expect(storage.getRawValue('a')).toMatchObject({ value: 'typed', formattedValue: 'typed' })
  })

  it('remove / resetModified 可用', () => {
    const storage = createAnnotationStorage()
    storage.setValue('a', { value: 'x' })
    storage.remove('a')
    expect(storage.has('a')).toBe(false)
    expect(storage.size).toBe(0)
    expect(() => storage.resetModified()).not.toThrow()
  })
})

describe('createDestResolver', () => {
  const makeDoc = (overrides: Partial<PDFDocumentProxy>) =>
    ({
      getPageIndex: vi.fn(),
      getDestination: vi.fn(),
      ...overrides,
    }) as unknown as PDFDocumentProxy

  it('数字页索引转为 1-based 页码', async () => {
    const resolve = createDestResolver(makeDoc({}))
    expect(await resolve(0)).toBe(1)
    expect(await resolve([2])).toBe(3)
  })

  it('对象引用通过 getPageIndex 解析', async () => {
    const doc = makeDoc({ getPageIndex: vi.fn(async () => 2) })
    const resolve = createDestResolver(doc)
    expect(await resolve([{ num: 20, gen: 0 }])).toBe(3)
    expect(doc.getPageIndex).toHaveBeenCalledWith({ num: 20, gen: 0 })
  })

  it('命名目标先经 getDestination 解析', async () => {
    const doc = makeDoc({
      getDestination: vi.fn(async () => [{ num: 5, gen: 0 }, { name: 'Fit' }]),
      getPageIndex: vi.fn(async () => 4),
    })
    const resolve = createDestResolver(doc)
    expect(await resolve('chapter1')).toBe(5)
  })

  it('解析失败返回 null', async () => {
    const doc = makeDoc({
      getPageIndex: vi.fn(async () => {
        throw new Error('bad ref')
      }),
    })
    const resolve = createDestResolver(doc)
    expect(await resolve([{ num: 1, gen: 0 }])).toBeNull()
  })
})

describe('createLinkService', () => {
  it('getDestinationHash 覆盖数字/数组/对象三种 dest', () => {
    const service = createLinkService({ onGotoPage: () => {} })
    expect(service.getDestinationHash(0)).toBe('#page=1')
    expect(service.getDestinationHash([2])).toBe('#page=3')
    // 对象引用无法同步解析，返回空串（点击时走 goToDestination）
    expect(service.getDestinationHash([{ num: 1, gen: 0 }])).toBe('')
  })

  it('addLinkAttributes 外链开新窗口', () => {
    const service = createLinkService({ onGotoPage: () => {} })
    const link = document.createElement('a')
    service.addLinkAttributes(link, 'https://example.com/', true)
    expect(link.href).toBe('https://example.com/')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('goToDestination 数字 dest 直接跳转', () => {
    const onGotoPage = vi.fn()
    const service = createLinkService({ onGotoPage })
    service.goToDestination(2)
    expect(onGotoPage).toHaveBeenCalledWith(3)
  })

  it('goToDestination 走解析器（对象引用）', async () => {
    const onGotoPage = vi.fn()
    const resolveDestPage = vi.fn(async () => 7)
    const service = createLinkService({ onGotoPage, resolveDestPage })
    service.goToDestination([{ num: 3, gen: 0 }])
    await vi.waitFor(() => expect(onGotoPage).toHaveBeenCalledWith(7))
  })
})
