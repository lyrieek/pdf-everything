import { describe, it, expect } from 'vitest'

import { formatRelativeTime } from '../relativeTime'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatRelativeTime', () => {
  const now = Date.UTC(2024, 0, 10, 12, 0, 0)

  it('过去的时间用「多久之前」', () => {
    expect(formatRelativeTime(new Date(now - 3 * DAY), 'en', now)).toBe('3 days ago')
    expect(formatRelativeTime(new Date(now - 2 * HOUR), 'en', now)).toBe('2 hours ago')
  })

  it('中文本地化', () => {
    expect(formatRelativeTime(new Date(now - 3 * DAY), 'zh', now)).toBe('3天前')
  })

  it('此刻显示 now / 现在', () => {
    expect(formatRelativeTime(new Date(now), 'en', now)).toBe('now')
    expect(formatRelativeTime(new Date(now), 'zh', now)).toBe('现在')
  })

  it('未来的时间为「多久之后」', () => {
    expect(formatRelativeTime(new Date(now + 3 * DAY), 'en', now)).toBe('in 3 days')
  })
})
