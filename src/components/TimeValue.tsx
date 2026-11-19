import { useEffect, useState } from 'preact/hooks'

import { Tooltip } from './Tooltip'
import { formatRelativeTime } from '../lib/relativeTime'

interface TimeValueProps {
  /** 已格式化的绝对时间（与复制 / INI 内容一致） */
  absolute: string
  /** 用于计算相对时间的时刻 */
  date: Date
  /** BCP 47 语言标签，如 `'zh'` / `'en'` */
  locale?: string
}

/** 相对时间刷新间隔：挂载期间每 30s 重算一次「多久之前」 */
const REFRESH_INTERVAL = 30_000

/**
 * 时间值：展示绝对时间，hover / 键盘聚焦时通过 Tooltip 显示实时相对时间。
 *
 * 仅在属性窗口打开时挂载，关闭即卸载，定时器随之清理。
 */
export function TimeValue({ absolute, date, locale }: TimeValueProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), REFRESH_INTERVAL)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Tooltip label={formatRelativeTime(date, locale)} align="start">
      <span className="time-value">{absolute}</span>
    </Tooltip>
  )
}
