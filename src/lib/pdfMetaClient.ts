/**
 * 元数据测量的异步封装：优先在 Web Worker 里计算，避免解码 / 扫描阻塞主线程，
 * 从而做到「只有该属性行显示加载态，其他行不受影响」。
 *
 * 退路：
 * - 无法创建 Worker（如环境不支持）→ 主线程同步计算（此时 buffer 尚未转移）；
 * - Worker 运行期出错 → 返回 0（buffer 已 transfer，无法回退），调用方按 文件大小/页数 估算。
 */
import { measureMetadataBytes } from './pdfMeta'

export function measureMetadataBytesAsync(buffer: ArrayBuffer): Promise<number> {
  let worker: Worker
  try {
    worker = new Worker(new URL('./pdfMeta.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return Promise.resolve(measureMetadataBytes(buffer))
  }

  return new Promise<number>((resolve) => {
    const finish = (value: number) => {
      worker.terminate()
      resolve(value)
    }

    worker.onmessage = (event: MessageEvent<number>) => {
      finish(typeof event.data === 'number' && Number.isFinite(event.data) ? event.data : 0)
    }
    worker.onerror = () => finish(0)

    // transfer：零拷贝把 buffer 移交给 Worker
    worker.postMessage(buffer, [buffer])
  })
}
