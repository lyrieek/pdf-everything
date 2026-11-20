import { useCallback, useEffect, useState } from 'preact/hooks'
import type { RefObject } from 'preact'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  ContextEditorMode,
  createContextEditor,
  type ContextEditor,
  type ContextEditorModeValue,
} from './contextEditor'

export interface UseContextEditorOptions {
  /** 当前文档；换文档时会重建上下文编辑器并退出编辑模式 */
  pdfDoc: PDFDocumentProxy | null
  /** 滚动容器，编辑器据此判断方向并处理键盘焦点 */
  containerRef: RefObject<HTMLElement | null>
  /** 页面容器，画布 / 文本层所在元素 */
  viewerRef: RefObject<HTMLElement | null>
}

export interface ContextEditorControls {
  /** 上下文编辑器管理器；pdfjs 未导出编辑器 API 时为 null */
  contextEditor: ContextEditor | null
  /** 是否处于编辑模式 */
  editing: boolean
  /** 当前工具 */
  editorMode: ContextEditorModeValue
  /** 切换工具 */
  setEditorMode: (mode: ContextEditorModeValue) => void
  /** 进入 / 退出编辑模式 */
  toggleEditing: () => void
  /** 退出编辑模式 */
  stopEditing: () => void
}

/**
 * 上下文编辑状态管理。
 *
 * 把「管理器生命周期 + 模式同步」从 PdfViewer 中抽离出来，PdfViewer 只需要
 * 把 `contextEditor` / `editing` 传给页面组件，并渲染编辑按钮 / 悬浮工具栏。
 */
export function useContextEditor(options: UseContextEditorOptions): ContextEditorControls {
  const { pdfDoc, containerRef, viewerRef } = options
  const [contextEditor, setContextEditor] = useState<ContextEditor | null>(null)
  const [editing, setEditing] = useState(false)
  const [editorMode, setEditorMode] = useState<ContextEditorModeValue>(ContextEditorMode.HIGHLIGHT)

  // 创建 / 销毁上下文编辑器（一个文档一个实例）
  useEffect(() => {
    if (!pdfDoc) {
      setContextEditor(null)
      return
    }
    const container = containerRef.current
    const viewer = viewerRef.current
    if (!container || !viewer) return

    const editor = createContextEditor({ pdfDoc, container, viewer })
    setContextEditor(editor)

    return () => {
      editor?.destroy()
    }
  }, [pdfDoc, containerRef, viewerRef])

  // 换文档时退出编辑模式，避免沿用上一个文档的工具状态
  useEffect(() => {
    setEditing(false)
    setEditorMode(ContextEditorMode.HIGHLIGHT)
  }, [pdfDoc])

  // 同步编辑器模式：编辑模式下用当前工具，退出时切到 NONE
  useEffect(() => {
    const editor = contextEditor
    if (!editor) return
    const mode = editing ? editorMode : ContextEditorMode.NONE
    editor.uiManager.updateMode(mode).catch((error: unknown) => {
      console.warn('切换上下文编辑模式失败：', error)
    })
  }, [contextEditor, editing, editorMode])

  const toggleEditing = useCallback(() => setEditing((value) => !value), [])
  const stopEditing = useCallback(() => setEditing(false), [])

  return {
    contextEditor,
    editing,
    editorMode,
    setEditorMode,
    toggleEditing,
    stopEditing,
  }
}
