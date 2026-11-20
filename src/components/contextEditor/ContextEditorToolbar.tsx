import { useTranslation } from 'react-i18next'
import { Tooltip } from '../Tooltip'
import { ContextEditorMode, type ContextEditor, type ContextEditorModeValue } from './contextEditor'
import {
  CheckIcon,
  DeleteIcon,
  FreeTextIcon,
  HighlightIcon,
  InkIcon,
  RedoIcon,
  UndoIcon,
} from './icons'

export interface ContextEditorToolbarProps {
  /** 上下文编辑器；为 null 时工具按钮禁用 */
  contextEditor: ContextEditor | null
  /** 当前工具 */
  mode: ContextEditorModeValue
  /** 切换工具 */
  onModeChange: (mode: ContextEditorModeValue) => void
  /** 退出编辑模式 */
  onDone: () => void
}

/** 编辑模式下的悬浮上下文编辑工具栏 */
export function ContextEditorToolbar({
  contextEditor,
  mode,
  onModeChange,
  onDone,
}: ContextEditorToolbarProps) {
  const { t } = useTranslation()
  const disabled = !contextEditor

  return (
    <div
      className="context-editor-toolbar"
      role="toolbar"
      aria-label={t('toolbar.annotationTools')}
    >
      <Tooltip label={t('toolbar.annotationHighlight')}>
        <button
          className={`icon-btn${mode === ContextEditorMode.HIGHLIGHT ? ' is-active' : ''}`}
          onClick={() => onModeChange(ContextEditorMode.HIGHLIGHT)}
          aria-label={t('toolbar.annotationHighlight')}
          aria-pressed={mode === ContextEditorMode.HIGHLIGHT}
          disabled={disabled}
        >
          <HighlightIcon />
        </button>
      </Tooltip>
      <Tooltip label={t('toolbar.annotationFreeText')}>
        <button
          className={`icon-btn${mode === ContextEditorMode.FREETEXT ? ' is-active' : ''}`}
          onClick={() => onModeChange(ContextEditorMode.FREETEXT)}
          aria-label={t('toolbar.annotationFreeText')}
          aria-pressed={mode === ContextEditorMode.FREETEXT}
          disabled={disabled}
        >
          <FreeTextIcon />
        </button>
      </Tooltip>
      <Tooltip label={t('toolbar.annotationInk')}>
        <button
          className={`icon-btn${mode === ContextEditorMode.INK ? ' is-active' : ''}`}
          onClick={() => onModeChange(ContextEditorMode.INK)}
          aria-label={t('toolbar.annotationInk')}
          aria-pressed={mode === ContextEditorMode.INK}
          disabled={disabled}
        >
          <InkIcon />
        </button>
      </Tooltip>
      <span className="context-editor-toolbar__divider" aria-hidden="true" />
      <Tooltip label={t('toolbar.annotationUndo')}>
        <button
          className="icon-btn"
          onClick={() => contextEditor?.uiManager.undo()}
          aria-label={t('toolbar.annotationUndo')}
          disabled={disabled}
        >
          <UndoIcon />
        </button>
      </Tooltip>
      <Tooltip label={t('toolbar.annotationRedo')}>
        <button
          className="icon-btn"
          onClick={() => contextEditor?.uiManager.redo()}
          aria-label={t('toolbar.annotationRedo')}
          disabled={disabled}
        >
          <RedoIcon />
        </button>
      </Tooltip>
      <Tooltip label={t('toolbar.annotationDelete')}>
        <button
          className="icon-btn"
          onClick={() => contextEditor?.uiManager.delete()}
          aria-label={t('toolbar.annotationDelete')}
          disabled={disabled}
        >
          <DeleteIcon />
        </button>
      </Tooltip>
      <span className="context-editor-toolbar__divider" aria-hidden="true" />
      <Tooltip label={t('toolbar.annotationDone')}>
        <button className="icon-btn" onClick={onDone} aria-label={t('toolbar.annotationDone')}>
          <CheckIcon />
        </button>
      </Tooltip>
    </div>
  )
}
