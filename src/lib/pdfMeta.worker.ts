/**
 * 元数据测量 Worker：把解码 / 扫描放到后台线程，避免阻塞属性窗口打开。
 * 由 `pdfMetaClient.ts` 通过 `new Worker(new URL(...))` 启动。
 */
import { measureMetadataBytes } from './pdfMeta'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null
  postMessage: (data: number) => void
}

const ctx = self as unknown as WorkerScope

ctx.onmessage = (event) => {
  ctx.postMessage(measureMetadataBytes(event.data))
}
