import * as pdfjsLib from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * AnnotationLayer 接入层
 * ======================
 * pdfjs-dist 主包导出 `AnnotationLayer`，但 `AnnotationStorage` / `PDFLinkService`
 * 没有导出（它们是 web/ 目录里的类），所以这里用最小鸭子类型补上。
 */

/** 注解存储的最小接口（pdfjs 的 AnnotationStorage 实际被用到的子集） */
export interface AnnotationStorageLike {
  /** 取值；无存储时返回 defaultValue，有存储时把存储值合并进 defaultValue */
  getValue: <T extends object>(key: string, defaultValue: T) => T
  getRawValue: (key: string) => unknown
  has: (key: string) => boolean
  setValue: (key: string, value: Record<string, unknown>) => void
  remove: (key: string) => void
  readonly size: number
  resetModified: () => void
}

/**
 * 链接服务的最小接口。
 *
 * 内部跳转统一产出 `#page=N`，由 PDFPage 拦截点击后调用 `goToPage`；
 * 外链走 `target="_blank"`。
 */
export interface LinkServiceLike {
  getDestinationHash: (dest: unknown) => string
  getAnchorUrl: (hash: string) => string
  addLinkAttributes: (link: HTMLAnchorElement, url: string, newWindow?: boolean) => void
  goToDestination: (dest: unknown) => void
  executeNamedAction: (...args: unknown[]) => void
  executeSetOCGState: (...args: unknown[]) => void
  getAttachmentContent: (...args: unknown[]) => Promise<unknown>
}

/**
 * 创建一个跨页面共享的注解存储。
 *
 * 必须是「每文档一个」：表单值需要跨页、跨缩放（缩放会重建 AnnotationLayer）保留。
 */
export function createAnnotationStorage(): AnnotationStorageLike {
  const storage = new Map<string, Record<string, unknown>>()

  return {
    getValue: (key, defaultValue) => {
      const value = storage.get(key)
      if (value === undefined) return defaultValue
      // 与 pdfjs 原生实现一致：把已存储的值合并进 defaultValue
      return defaultValue && typeof defaultValue === 'object'
        ? Object.assign(defaultValue, value)
        : (value as typeof defaultValue)
    },
    getRawValue: (key) => storage.get(key),
    has: (key) => storage.has(key),
    setValue: (key, value) => {
      // pdfjs 的文本控件在 input 时只存 { value }，而重新渲染时用
      // `storedData.formattedValue || data.textContent`（PDF 原值）回填，
      // 于是缩放 / 翻页后输入内容会被原值覆盖。这里同步一份 formattedValue，
      // 让文本域的输入在注解层重建后依然保留。
      const patch: Record<string, unknown> = { ...value }
      if (typeof patch.value === 'string' && patch.formattedValue === undefined) {
        patch.formattedValue = patch.value
      }
      const existing = storage.get(key)
      if (existing) Object.assign(existing, patch)
      else storage.set(key, patch)
    },
    remove: (key) => {
      storage.delete(key)
    },
    get size() {
      return storage.size
    },
    resetModified: () => {},
  }
}

/** PDF dest 的目标引用：页码索引、PDF 对象引用，或命名目标 */
export type PdfDest = number | { num: number; gen: number } | string

/**
 * 创建一个把 PDF dest 解析为 1-based 页码的解析器。
 *
 * 需要 `PDFDocumentProxy`：`getAnnotations()` 返回的 dest 往往是
 * `[{num, gen}, {name: 'Fit'}]`（对象引用），同步代码拿不到页号。
 */
export function createDestResolver(pdfDoc: pdfjsLib.PDFDocumentProxy) {
  const resolveRef = async (ref: PdfDest): Promise<number | null> => {
    if (typeof ref === 'number') return ref + 1
    if (typeof ref === 'string') {
      // 命名目标：先解析成 dest 数组再递归
      try {
        const resolved = await pdfDoc.getDestination(ref)
        return resolved ? resolveRef(resolved[0] as PdfDest) : null
      } catch {
        return null
      }
    }
    if (ref && typeof ref === 'object' && typeof ref.num === 'number') {
      try {
        return (await pdfDoc.getPageIndex(ref)) + 1
      } catch {
        return null
      }
    }
    return null
  }

  return async (dest: unknown): Promise<number | null> => {
    if (Array.isArray(dest) && dest.length > 0) return resolveRef(dest[0] as PdfDest)
    return resolveRef(dest as PdfDest)
  }
}

/**
 * 创建链接服务。
 *
 * 点击内部链接时由 pdf.js 调用 `goToDestination`（`link.onclick` 内部），
 * 这里把它转成 `onGotoPage`；外链由 `addLinkAttributes` 设 `target="_blank"`。
 */
export function createLinkService(options: {
  onGotoPage: (pageNumber: number) => void
  /** 把 dest 解析为 1-based 页码；省略时只支持「数字页索引」的简单情形 */
  resolveDestPage?: (dest: unknown) => Promise<number | null>
}): LinkServiceLike {
  const { onGotoPage, resolveDestPage } = options

  return {
    getDestinationHash: (dest) => {
      // 同步只能处理数字页索引；对象引用 / 命名目标返回空串，
      // 实际跳转由 link.onclick → goToDestination 完成
      if (typeof dest === 'number') return `#page=${dest + 1}`
      if (Array.isArray(dest) && typeof dest[0] === 'number') return `#page=${dest[0] + 1}`
      return ''
    },
    getAnchorUrl: (hash) => hash,
    addLinkAttributes: (link, url, newWindow = false) => {
      link.href = url
      if (newWindow) {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    },
    goToDestination: (dest) => {
      const goto = (page: number | null) => {
        if (page != null && page >= 1) onGotoPage(page)
      }
      if (resolveDestPage) {
        resolveDestPage(dest)
          .then(goto)
          .catch(() => {})
        return
      }
      // 兜底：没有解析器时只认数字页索引
      const first = Array.isArray(dest) ? dest[0] : dest
      goto(typeof first === 'number' ? first + 1 : null)
    },
    // 命名动作 / OCG 状态 / 附件内容：暂不支持，保持无副作用
    executeNamedAction: () => {},
    executeSetOCGState: () => {},
    getAttachmentContent: () => Promise.resolve(null),
  }
}

/** 注解图标资源基址（annotation-*.svg，随构建拷贝到 dist/pdfjs/images） */
export const ANNOTATION_IMAGE_RESOURCES_PATH = `${import.meta.env.BASE_URL}pdfjs/images/`

/** AnnotationLayer 的构造参数 / render 参数类型 */
type AnnotationLayerCtor = ConstructorParameters<typeof pdfjsLib.AnnotationLayer>[0]
type AnnotationLayerRenderParams = Parameters<pdfjsLib.AnnotationLayer['render']>[0]

/** AnnotationLayer 的句柄，用于在 effect 清理时销毁 */
export interface AnnotationLayerHandle {
  destroy: () => void
}

export interface RenderAnnotationLayerOptions {
  /** 注解容器（必须是页内绝对定位、与 canvas 同尺寸的 div） */
  div: HTMLDivElement
  page: PDFPageProxy
  viewport: ReturnType<PDFPageProxy['getViewport']>
  /** 跨页面共享的注解存储 */
  annotationStorage: AnnotationStorageLike
  /** 内部页跳转回调 */
  onGotoPage: (pageNumber: number) => void
  /** 用于解析 dest 里的对象引用 / 命名目标；省略时只支持数字页索引 */
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null
  /** 注解外观 canvas 映射（hasOwnCanvas 注解的外观绘制在此 canvas 上，随后挂到 DOM 注解层内） */
  annotationCanvasMap?: Map<string, HTMLCanvasElement>
}

/**
 * 渲染注解层：链接可点、表单可填。
 *
 * 需要 `page.render({ annotationMode: AnnotationMode.ENABLE_FORMS })` 配合 ——
 * canvas 不再绘制交互式表单外观，交给注解层渲染成真正的 input/select。
 *
 * 立刻返回 handle（不阻塞调用方），内部异步完成 `getAnnotations` + `render`。
 */
export function renderAnnotationLayer(
  options: RenderAnnotationLayerOptions,
): AnnotationLayerHandle {
  const { div, page, viewport, annotationStorage, onGotoPage, pdfDoc, annotationCanvasMap } =
    options
  const linkService = createLinkService({
    onGotoPage,
    resolveDestPage: pdfDoc ? createDestResolver(pdfDoc) : undefined,
  })

  const layer = new pdfjsLib.AnnotationLayer({
    div,
    accessibilityManager: undefined,
    annotationEditorUIManager: undefined,
    page,
    viewport,
    structTreeLayer: undefined,
    commentManager: undefined,
    linkService,
    annotationStorage,
    annotationCanvasMap,
  } as unknown as AnnotationLayerCtor)

  let disposed = false

  page
    .getAnnotations({ intent: 'display' })
    .then((annotations) => {
      if (disposed || !annotations?.length) return
      // ENABLE_FORMS 下，canvas 已绘制所有非表单注解的 appearance（如 FreeText 的外观）。
      // 注解层只渲染链接、表单控件及无 appearance 的图标类注解（Text/FileAttachment/Stamp 等），
      // 避免已在 canvas 上绘制的外观在注解层重复绘制导致叠影。
      const filtered = annotations.filter(
        (a) =>
          !(
            (a as { hasAppearance?: boolean; subtype?: string }).hasAppearance &&
            (a as { subtype?: string }).subtype !== 'Widget'
          ),
      )
      return layer.render({
        viewport,
        div,
        annotations: filtered,
        page,
        linkService,
        downloadManager: undefined,
        annotationStorage,
        imageResourcesPath: ANNOTATION_IMAGE_RESOURCES_PATH,
        renderForms: true,
        enableAnnotationEditing: false,
        enableScripting: false,
      } as unknown as AnnotationLayerRenderParams)
    })
    .catch((error: unknown) => {
      if (disposed) return
      console.warn('AnnotationLayer 渲染失败：', error)
    })

  return {
    destroy: () => {
      disposed = true
      try {
        layer.destroy()
      } catch {
        /* noop */
      }
    },
  }
}
