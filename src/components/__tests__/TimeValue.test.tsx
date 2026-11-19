import { render } from '@testing-library/preact'
import { describe, it, expect } from 'vitest'

import { TimeValue } from '../TimeValue'
import { formatRelativeTime } from '../../lib/relativeTime'

describe('TimeValue', () => {
  it('显示绝对时间，并在 tooltip 上给出相对时间', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const { container } = render(
      <TimeValue absolute="2024/01/01 00:00:00" date={date} locale="en" />,
    )

    expect(container.textContent).toContain('2024/01/01 00:00:00')

    const tooltip = container.querySelector('.tooltip')
    expect(tooltip?.getAttribute('data-tooltip')).toBe(formatRelativeTime(date, 'en'))
  })
})
