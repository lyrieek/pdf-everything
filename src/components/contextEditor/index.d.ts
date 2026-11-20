/**
 * `src/components/contextEditor` 的公共类型声明。
 *
 * 实现位于同目录的 `.ts` / `.tsx` 文件中；本文件集中声明目录对外暴露的 API，
 * 方便其他模块只从这里导入上下文编辑相关的类型与组件。
 */

export { ContextEditorMode, createContextEditor, createContextEditorLayer } from './contextEditor'
export type {
  ContextEditor,
  ContextEditorModeValue,
  ContextEditorEventBus,
  ContextEditorLayerHandle,
  CreateContextEditorOptions,
  CreateContextEditorLayerOptions,
} from './contextEditor'

export { ContextEditorToggle } from './ContextEditorToggle'
export type { ContextEditorToggleProps } from './ContextEditorToggle'

export { ContextEditorToolbar } from './ContextEditorToolbar'
export type { ContextEditorToolbarProps } from './ContextEditorToolbar'

export { useContextEditor } from './useContextEditor'
export type { ContextEditorControls, UseContextEditorOptions } from './useContextEditor'
