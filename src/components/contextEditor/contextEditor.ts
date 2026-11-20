import * as pdfjsLib from 'pdfjs-dist'

// 编辑器样式（pdf.js 官方 pdf_viewer.css 内含注解编辑器所需的全部样式）
import 'pdfjs-dist/web/pdf_viewer.css'

/**
 * ContextEditor 接入层（pdf.js AnnotationEditor 适配）
 * ==================================================
 * pdfjs-dist 主包导出了 `AnnotationEditorUIManager` / `AnnotationEditorLayer` /
 * `DrawLayer`，但它们依赖 web/ 目录里的 `L10n`、评论/签名管理器等对象。
 * 这里用最小实现把缺失的依赖补齐，让编辑器能在 React 应用里独立运行。
 */

/**
 * 编辑器模式。
 *
 * 与 pdf.js 的 `AnnotationEditorType` 对齐；这里单独定义是为了在测试 mock
 * 未导出该常量时仍然可用。
 */
export const ContextEditorMode = {
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  INK: 15,
} as const

export type ContextEditorModeValue = (typeof ContextEditorMode)[keyof typeof ContextEditorMode]

type ContextEditorEventHandler = (data: any) => void

/**
 * 安全读取 pdfjs 的可选导出。
 *
 * 测试里 `pdfjs-dist` 常被 mock 成只有部分导出，直接访问缺失的命名导出会抛
 * 错；这里用 try/catch 把「没有导出」当作 undefined 处理。
 */
function optionalExport<T>(name: string): T | undefined {
  try {
    return (pdfjsLib as unknown as Record<string, T | undefined>)[name]
  } catch {
    return undefined
  }
}

/** 事件总线的最小接口（pdf.js 的 `EventBus` 未被主包导出） */
export interface ContextEditorEventBus {
  on(
    name: string,
    handler: ContextEditorEventHandler,
    options?: { once?: boolean; signal?: AbortSignal; internal?: string },
  ): void
  off(name: string, handler: ContextEditorEventHandler): void
  dispatch(name: string, data?: unknown): void
}

/** 创建一个满足 pdf.js 编辑器所需的最小事件总线 */
export function createContextEditorEventBus(): ContextEditorEventBus {
  const listeners = new Map<string, Set<{ handler: ContextEditorEventHandler; once: boolean }>>()

  const off = (name: string, handler: ContextEditorEventHandler) => {
    const set = listeners.get(name)
    if (!set) return
    for (const entry of set) {
      if (entry.handler === handler) set.delete(entry)
    }
    if (set.size === 0) listeners.delete(name)
  }

  return {
    on(name, handler, options) {
      if (options?.signal?.aborted) return
      let set = listeners.get(name)
      if (!set) {
        set = new Set()
        listeners.set(name, set)
      }
      set.add({ handler, once: options?.once === true })
      options?.signal?.addEventListener('abort', () => off(name, handler), { once: true })
    },
    off,
    dispatch(name, data) {
      const set = listeners.get(name)
      if (!set) return
      for (const entry of [...set]) {
        if (entry.once) off(name, entry.handler)
        entry.handler(data)
      }
    },
  }
}

/**
 * `L10n` 的最小替身。
 *
 * pdf.js 的编辑器只在无障碍提示 / 替代文本里调用 `l10n.get`，这里返回 key
 * 本身即可；`AnnotationEditorLayer` 的类型要求完整 `L10n`，因此在使用处做类型
 * 断言。
 */
const contextEditorL10n = {
  get: async (key: string) => key,
  set: async () => {},
  pause: () => {},
  resume: () => {},
  has: () => false,
}

/**
 * 高亮默认调色板（与 pdf.js viewer 的 `highlightEditorColors` 默认值一致）。
 *
 * 必须提供非 null 值：`getNonHCMColorName()` 会在 `highlightColorNames` 为
 * null 时直接 `.get()`，导致加载已有高亮时抛错。
 */
const DEFAULT_HIGHLIGHT_COLORS =
  'yellow=#FFFF98,green=#53FFBC,blue=#80EBFF,pink=#FFCBE6,red=#FF4F5F,' +
  'yellow_HCM=#FFFFCC,green_HCM=#53FFBC,blue_HCM=#80EBFF,pink_HCM=#F6B8FF,red_HCM=#C50043'

/** 上下文编辑器管理器：一个文档一个实例，供所有页面共享 */
export interface ContextEditor {
  uiManager: pdfjsLib.AnnotationEditorUIManager
  l10n: typeof contextEditorL10n
  destroy: () => void
}

export interface CreateContextEditorOptions {
  pdfDoc: pdfjsLib.PDFDocumentProxy
  /** 滚动容器，编辑器据此判断方向并处理键盘焦点 */
  container: HTMLElement
  /** 页面容器，画布 / 文本层所在元素 */
  viewer: HTMLElement
}

/**
 * 创建上下文编辑器（ContextEditor）。
 *
 * 测试或旧版本 pdfjs 未导出编辑器 API 时返回 null，调用方据此关闭编辑能力。
 */
export function createContextEditor(options: CreateContextEditorOptions): ContextEditor | null {
  const { pdfDoc, container, viewer } = options

  const UIManagerCtor = optionalExport<
    new (...args: unknown[]) => pdfjsLib.AnnotationEditorUIManager
  >('AnnotationEditorUIManager')
  if (!UIManagerCtor) return null

  // `AnnotationEditorLayer._initialized` 是全局静态标记，编辑器类型只会在第一次
  // 创建编辑器层时绑定当时的 uiManager / l10n。换文档时重置，避免新文档的编辑器
  // 仍然引用上一个文档的 uiManager。
  const LayerCtor = optionalExport<{ _initialized?: boolean }>('AnnotationEditorLayer')
  if (LayerCtor) LayerCtor._initialized = false

  const eventBus = createContextEditorEventBus()
  const uiManager = new UIManagerCtor(
    container,
    viewer,
    /* viewerAlert */ null,
    /* altTextManager */ null,
    /* commentManager */ null,
    /* signatureManager */ null,
    eventBus,
    pdfDoc,
    /* pageColors */ null,
    DEFAULT_HIGHLIGHT_COLORS,
    /* enableHighlightFloatingButton */ false,
    /* enableUpdatedAddImage */ false,
    /* enableNewAltTextWhenAddingImage */ false,
    /* mlManager */ null,
    /* editorUndoBar */ null,
    /* supportsPinchToZoom */ false,
    /* keepToolbarInPage */ false,
  )

  return {
    uiManager,
    l10n: contextEditorL10n,
    destroy: () => {
      try {
        uiManager.destroy()
      } catch {
        /* noop */
      }
    },
  }
}

export interface CreateContextEditorLayerOptions {
  manager: ContextEditor
  /** 0-based 页索引 */
  pageIndex: number
  viewport: ReturnType<pdfjsLib.PDFPageProxy['getViewport']>
  annotationLayer: pdfjsLib.AnnotationLayer
  textLayerDiv: HTMLDivElement
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null
  /** 编辑器层要挂载到的父元素（与注解层同级） */
  parent: HTMLElement
}

export interface ContextEditorLayerHandle {
  ready: Promise<void>
  destroy: () => void
}

/**
 * 创建一个页面的上下文编辑器层。
 *
 * 与 pdf.js 的 `AnnotationEditorLayerBuilder` 行为一致：构造时自动注册到
 * uiManager，随后 `render` 设置尺寸并挂载已有编辑器。
 */
export function createContextEditorLayer(
  options: CreateContextEditorLayerOptions,
): ContextEditorLayerHandle {
  const { manager, pageIndex, viewport, annotationLayer, textLayerDiv, pdfDoc, parent } = options

  const EditorLayerCtor =
    optionalExport<new (...args: unknown[]) => pdfjsLib.AnnotationEditorLayer>(
      'AnnotationEditorLayer',
    )
  const DrawLayerCtor = optionalExport<new (...args: unknown[]) => pdfjsLib.DrawLayer>('DrawLayer')
  if (!EditorLayerCtor || !DrawLayerCtor) {
    throw new Error('当前 pdfjs-dist 未导出注解编辑器')
  }

  const div = document.createElement('div')
  div.className = 'annotationEditorLayer'
  parent.append(div)

  let drawLayer: pdfjsLib.DrawLayer | null = null
  try {
    drawLayer = new DrawLayerCtor({
      pageIndex,
      textLayer: textLayerDiv,
      filterFactory: pdfDoc?.filterFactory ?? null,
      pageColors: null,
    })
    drawLayer.setParent(div)

    const layer = new EditorLayerCtor({
      uiManager: manager.uiManager,
      pageIndex,
      div,
      structTreeLayer: null,
      accessibilityManager: undefined,
      annotationLayer,
      drawLayer,
      // pdf.js 内部通过 `textLayer.div` 访问文本层元素
      textLayer: { div: textLayerDiv },
      viewport,
      l10n: manager.l10n,
    } as unknown as ConstructorParameters<typeof pdfjsLib.AnnotationEditorLayer>[0])

    let disposed = false

    const ready = layer
      .render({ viewport })
      .then(() => {})
      .catch((error: unknown) => {
        if (disposed) return
        console.warn('ContextEditorLayer 渲染失败：', error)
      })

    return {
      ready,
      destroy: () => {
        if (disposed) return
        disposed = true
        try {
          layer.destroy()
        } catch {
          /* noop */
        }
        try {
          drawLayer?.destroy()
        } catch {
          /* noop */
        }
        div.remove()
      },
    }
  } catch (error) {
    try {
      drawLayer?.destroy()
    } catch {
      /* noop */
    }
    div.remove()
    throw error
  }
}
