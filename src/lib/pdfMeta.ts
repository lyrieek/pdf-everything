/**
 * PDF 元数据体积测量（用于「平均每页占用」估算）。
 *
 * 口径：读取原始字节，定位文档信息字典（Info）与 XMP 元数据流（Metadata），
 * 把它们的对象字节跨度相加。这样得到的是「精确解析」的元数据体积，而不是固定开销。
 *
 * 局限（已在下方注释说明）：
 * - 仅识别经典 xref 下的顶层 `N G obj`；若 Info / Metadata 被压进对象流（ObjStm），
 *   该部分无法定位，按 0 计（调用方据此回退为 文件大小 / 页数）。
 * - 结果是对象在文件中的字节跨度近似，足够作为平均每页占用的扣除项。
 *
 * 性能：解码 + 扫描是 O(文件大小)，因此调用方必须只在「属性窗口打开时」执行，
 * 且对超大文件跳过（见 MAX_PRECISE_METADATA_BYTES），绝不能拖慢初始加载。
 */

/** 超过该字节数则不做精确解析（避免在 Worker / 主线程里解码、扫描超大文件） */
export const MAX_PRECISE_METADATA_BYTES = 128 * 1024 * 1024

function measureReferencedObject(text: string, key: 'Info' | 'Metadata'): number {
  // 取最后一次出现的 `/Key N G R` 引用（trailer / catalog 通常在文件尾部）
  const refRe = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`, 'g')
  let match: RegExpExecArray | null
  let last: { num: string; gen: string } | null = null
  while ((match = refRe.exec(text)) !== null) {
    last = { num: match[1], gen: match[2] }
  }
  if (!last) return 0
  return measureObjectSpan(text, last.num, last.gen)
}

function measureObjectSpan(text: string, num: string, gen: string): number {
  // `(^|[^0-9])` 避免 `5 0 obj` 误匹配到 `15 0 obj`
  const objRe = new RegExp(`(^|[^0-9])${num}\\s+${gen}\\s+obj\\b`, 'g')
  const match = objRe.exec(text)
  if (!match) return 0

  const start = match.index + match[1].length
  const end = text.indexOf('endobj', start)
  // 找不到 endobj 说明无法可靠界定对象边界，按 0 计（避免把「到文件尾」当成对象体积）
  if (end === -1) return 0
  return end + 'endobj'.length - start
}

/** 线性化（Fast Web View）字典必然出现在文件头部第一个对象中 */
export const LINEARIZED_SCAN_BYTES = 4096

/**
 * 判断 buffer 头部是否存在 `/Linearized` 字典（Fast Web View / 线性化）。
 * 只需读取文件开头几 KB，由调用方切片后传入。
 */
export function detectLinearized(headBuffer: ArrayBuffer): boolean {
  if (headBuffer.byteLength === 0) return false
  let text: string
  try {
    text = new TextDecoder('latin1').decode(new Uint8Array(headBuffer))
  } catch {
    return false
  }
  return /\/Linearized\b/.test(text)
}

/**
 * 测量 buffer 中元数据（Info + Metadata）的字节体积。
 * 解析失败 / 无元数据时返回 0。
 */
export function measureMetadataBytes(buffer: ArrayBuffer): number {
  const total = buffer.byteLength
  if (total === 0) return 0

  let text: string
  try {
    // latin1（windows-1252）是单字节编码：每个字节对应一个码点，
    // 因此字符串下标与字节偏移一一对应，便于用正则定位 ASCII 结构。
    text = new TextDecoder('latin1').decode(new Uint8Array(buffer))
  } catch {
    return 0
  }

  const bytes = measureReferencedObject(text, 'Info') + measureReferencedObject(text, 'Metadata')
  return Math.min(Math.max(bytes, 0), total)
}
