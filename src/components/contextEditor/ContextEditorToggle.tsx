import { useTranslation } from 'react-i18next'
import { Tooltip } from '../Tooltip'
import type { ContextEditor } from './contextEditor'
import { EditIcon } from './icons'

export interface ContextEditorToggleProps {
  /** 上下文编辑器；为 null 时按钮禁用 */
  contextEditor: ContextEditor | null
  /** 当前是否处于编辑模式 */
  editing: boolean
  /** 切换编辑模式 */
  onToggle: () => void
}

/** 顶部工具栏的「编辑注解」开关按钮 */
export function ContextEditorToggle({
  contextEditor,
  editing,
  onToggle,
}: ContextEditorToggleProps) {
  const { t } = useTranslation()

  return (
    <Tooltip label={t('toolbar.editAnnotations')} align="end">
      <button
        className={`icon-btn${editing ? ' is-active' : ''}`}
        onClick={onToggle}
        disabled={!contextEditor}
        aria-label={t('toolbar.editAnnotations')}
        aria-pressed={editing}
      >
        <EditIcon />
      </button>
    </Tooltip>
  )
}
