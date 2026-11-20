import { useTranslation } from 'react-i18next'
import annotationCommentIcon from 'pdfjs-dist/web/images/annotation-comment.svg'
import { Tooltip } from '../Tooltip'

export interface AnnotationEditorButtonProps {
  /** 面板是否显示 */
  visible: boolean
  /** 是否禁用（没有文档时） */
  disabled?: boolean
  /** 切换面板显示 */
  onToggle: () => void
}

/** 顶部工具栏的「注解」按钮 */
export function AnnotationEditorButton({
  visible,
  disabled,
  onToggle,
}: AnnotationEditorButtonProps) {
  const { t } = useTranslation()

  return (
    <Tooltip label={t('annotationEditor.title')} align="end">
      <button
        type="button"
        className={`icon-btn${visible ? ' is-active' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        aria-label={t('annotationEditor.title')}
        aria-pressed={visible}
      >
        <img src={annotationCommentIcon} alt="" width="18" height="18" />
      </button>
    </Tooltip>
  )
}
