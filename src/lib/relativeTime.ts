/**
 * 相对时间：把某个时刻格式化为「多久之前 / 之后」。
 *
 * 使用 `Intl.RelativeTimeFormat` 做本地化（中/英文自动给出「3 天前 / 3 days ago」），
 * 因此无需额外维护 i18n 文案。纯函数，便于单测；定时刷新由调用方负责。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', YEAR],
  ['month', MONTH],
  ['week', WEEK],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
  ['second', 1000],
]

/**
 * 把 `date` 相对 `now`（默认当前时间）格式化为本地化的相对时间。
 *
 * @param date 目标时刻
 * @param locale BCP 47 语言标签，如 `'zh'` / `'en'`
 * @param now 参照时刻（默认 `Date.now()`，测试可注入固定值）
 */
export function formatRelativeTime(date: Date, locale?: string, now: number = Date.now()): string {
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms || unit === 'second') {
      return formatter.format(Math.trunc(diff / ms), unit)
    }
  }
  return formatter.format(0, 'second')
}
