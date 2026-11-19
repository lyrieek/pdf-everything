/**
 * 属性导出：把属性面板的条目序列化为 INI 文本，并复制到剪贴板。
 */

export interface PropertyItem {
  /** 展示用的键名（按当前语言本地化） */
  label: string
  /** 展示用的值；为空时用 unknownLabel 占位 */
  value?: string
}

export interface PropertyGroup {
  /** 分组标题（按当前语言本地化） */
  title: string
  items: PropertyItem[]
}

/**
 * 把属性分组序列化为 INI 文本：
 *
 * ```
 * [文档信息]
 * 文件名 = a.pdf
 * 作者 = 张三
 *
 * [文档统计]
 * 页数 = 128
 * ```
 *
 * - 空值用 `unknownLabel` 占位；
 * - 值中的换行替换为空格，避免破坏 INI 的「一行一项」结构。
 */
export function buildIni(groups: PropertyGroup[], unknownLabel: string): string {
  return groups
    .map((group) => {
      const lines = [`[${group.title}]`]
      for (const item of group.items) {
        const raw = item.value ?? ''
        const value = /[\r\n]/.test(raw) ? raw.replace(/\r?\n/g, ' ') : raw
        lines.push(`${item.label} = ${value || unknownLabel}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

/**
 * 复制文本到剪贴板。
 *
 * 优先用异步 Clipboard API；不可用或失败时回退到临时 `textarea` + `execCommand`。
 * 返回是否复制成功。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试回退方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
