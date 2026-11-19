import { describe, it, expect } from 'vitest'

import { formatBytes, formatLoadProgress } from '../loadProgress'

describe('formatBytes', () => {
  it('0 与非法值回退到 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })

  it('按 1024 进位到 B / KB / MB / GB', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3 GB')
  })

  it('超过 GB 时封顶在 GB 单位', () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120 GB')
  })
})

describe('formatLoadProgress', () => {
  it('total > 0 时显示百分比', () => {
    expect(formatLoadProgress(0, 100)).toBe('0%')
    expect(formatLoadProgress(50, 100)).toBe('50%')
    expect(formatLoadProgress(1, 3)).toBe('33%')
    expect(formatLoadProgress(2, 3)).toBe('67%')
  })

  it('百分比夹紧到 100，避免 loaded > total 时溢出', () => {
    expect(formatLoadProgress(150, 100)).toBe('100%')
  })

  it('total === 0（流式）降级为已加载字节数', () => {
    expect(formatLoadProgress(2048, 0)).toBe('2 KB')
    expect(formatLoadProgress(0, 0)).toBe('0 B')
  })
})
