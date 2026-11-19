import { describe, it, expect, vi } from 'vitest'

import { buildIni, copyToClipboard } from '../propertyExport'

describe('buildIni', () => {
  it('按分组输出 [标题] 与 key = value', () => {
    const ini = buildIni(
      [
        {
          title: '文档信息',
          items: [
            { label: '作者', value: '张三' },
            { label: '主题', value: '规划' },
          ],
        },
        { title: '文档统计', items: [{ label: '页数', value: '128' }] },
      ],
      '未知',
    )

    expect(ini).toBe('[文档信息]\n作者 = 张三\n主题 = 规划\n\n[文档统计]\n页数 = 128')
  })

  it('空值用 unknownLabel 占位', () => {
    const ini = buildIni(
      [
        {
          title: '文档信息',
          items: [
            { label: '作者', value: undefined },
            { label: '主题', value: '' },
          ],
        },
      ],
      '未知',
    )

    expect(ini).toBe('[文档信息]\n作者 = 未知\n主题 = 未知')
  })

  it('值里的换行替换为空格，避免破坏 INI 结构', () => {
    const ini = buildIni([{ title: 'T', items: [{ label: 'K', value: 'a\nb' }] }], '未知')
    expect(ini).toBe('[T]\nK = a b')
  })

  it('键名与分组标题由调用方按当前语言传入', () => {
    const en = buildIni(
      [{ title: 'Document Info', items: [{ label: 'Author', value: 'Ada' }] }],
      'Unknown',
    )
    expect(en).toBe('[Document Info]\nAuthor = Ada')
  })
})

describe('copyToClipboard', () => {
  it('Clipboard API 成功时返回 true', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    try {
      await expect(copyToClipboard('hello')).resolves.toBe(true)
      expect(writeText).toHaveBeenCalledWith('hello')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Clipboard API 与回退都失败时返回 false', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    })
    const originalExec = (document as unknown as { execCommand?: unknown }).execCommand
    ;(document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false)
    try {
      await expect(copyToClipboard('hello')).resolves.toBe(false)
    } finally {
      ;(document as unknown as { execCommand: unknown }).execCommand = originalExec
      vi.unstubAllGlobals()
    }
  })
})
