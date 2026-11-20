import { useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { formatPdfDate } from '../../lib/pdfDate'
import { Tooltip } from '../Tooltip'
import { AnnotationIcon, TEXT_ICON_OPTIONS } from './AnnotationIcon'
import {
  annotationDisplayText,
  annotationIconLabelKey,
  annotationTypeLabelKey,
  type AnnotationListItem,
} from './annotationTypes'

export interface AnnotationItemProps {
  item: AnnotationListItem
  /** 当前是否选中 */
  selected: boolean
  /** 详情是否展开 */
  expanded: boolean
  /** 是否处于编辑态 */
  editing: boolean
  /** 只读（如加密 PDF）：禁用编辑 / 删除 */
  readOnly?: boolean
  /** 刚被修改：短暂高亮，帮助用户定位 */
  justChanged?: boolean
  /** 点击条目：定位到页面并选中 */
  onSelect: () => void
  /** 展开 / 收起详情 */
  onToggle: () => void
  /** 进入编辑态 */
  onEditStart: () => void
  /** 保存编辑 */
  onEditSave: (pageNumber: number, index: number, contents: string, author: string) => void
  /** 取消编辑 */
  onEditCancel: () => void
  /** 重新定位（进入放置模式选新位置） */
  onRelocate: () => void
  /** 更换 Text 注解的图标（写入 PDF /Name） */
  onIconChange: (iconName: string) => void
  /** 删除注解 */
  onDelete: () => void
}

/** 注解列表面板中的单条注解 */
export function AnnotationItem({
  item,
  selected,
  expanded,
  editing,
  readOnly = false,
  justChanged = false,
  onSelect,
  onToggle,
  onEditStart,
  onEditSave,
  onEditCancel,
  onRelocate,
  onIconChange,
  onDelete,
}: AnnotationItemProps) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)

  // 编辑草稿放在组件本地：保存时直接读取当前输入值，
  // 不依赖父组件 props 何时刷新，避免快速输入后保存拿到旧值。
  const [draftContents, setDraftContents] = useState(item.contents)
  const [draftAuthor, setDraftAuthor] = useState(item.author)

  useEffect(() => {
    if (!editing) return
    setDraftContents(item.contents)
    setDraftAuthor(item.author)
    // 只在进入编辑态 / 切换注解时重置草稿
  }, [editing, item.id, item.contents, item.author])

  const typeLabel = t(annotationTypeLabelKey(item.subtype))
  const displayText = annotationDisplayText(item, typeLabel)
  const created = formatPdfDate(item.creationDate, i18n.language)
  const modified = formatPdfDate(item.modificationDate, i18n.language)

  const authorRef = useRef<HTMLSpanElement>(null)
  const [authorOverflow, setAuthorOverflow] = useState(false)
  const [authorCopied, setAuthorCopied] = useState(false)

  // 作者名宽度受限：仅在文字被省略（溢出）时启用 Tooltip 与复制
  useEffect(() => {
    const el = authorRef.current
    if (!el) return
    const measure = () => setAuthorOverflow(el.scrollWidth > el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.author, authorOverflow])

  const copyAuthor = async () => {
    if (!item.author) return
    try {
      await navigator.clipboard.writeText(item.author)
      setAuthorCopied(true)
      setTimeout(() => setAuthorCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默失败，不影响面板
    }
  }

  const authorNode = (
    <span
      ref={authorRef}
      className="annotation-editor-item__author-text"
      tabIndex={authorOverflow ? 0 : undefined}
      onDblClick={copyAuthor}
    >
      {item.author}
    </span>
  )

  const copyContents = async () => {
    if (!item.contents) return
    try {
      await navigator.clipboard.writeText(item.contents)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默失败，不影响面板
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect()
  }

  const canEdit = item.subtype === 'Text' || item.subtype === 'FreeText'

  return (
    <li
      data-annotation-key={item.id}
      className={`annotation-editor-item${selected ? ' is-selected' : ''}${
        expanded ? ' is-expanded' : ''
      }${justChanged ? ' is-just-changed' : ''}`}
    >
      {editing ? (
        <div className="annotation-editor-item__edit">
          <div className="annotation-editor-item__edit-head">
            <AnnotationIcon
              subtype={item.subtype}
              icon={item.icon}
              className="annotation-editor-item__icon"
            />
            <span className="annotation-editor-item__edit-title">{t('annotationEditor.edit')}</span>
          </div>
          <textarea
            className="annotation-editor-item__edit-text"
            value={draftContents}
            onInput={(e) => setDraftContents(e.currentTarget.value)}
            placeholder={t('annotationEditor.addContentsPlaceholder')}
            rows={3}
          />
          <input
            className="annotation-editor-item__edit-author"
            value={draftAuthor}
            onInput={(e) => setDraftAuthor(e.currentTarget.value)}
            placeholder={t('annotationEditor.authorPlaceholder')}
          />
          <div className="annotation-editor-item__edit-actions">
            <button
              type="button"
              className="annotation-editor-item__action is-primary"
              onClick={() => onEditSave(item.pageNumber, item.index, draftContents, draftAuthor)}
              disabled={readOnly}
            >
              {t('annotationEditor.save')}
            </button>
            <button type="button" className="annotation-editor-item__action" onClick={onEditCancel}>
              {t('annotationEditor.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="annotation-editor-item__row"
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={handleKeyDown}
        >
          {item.color && (
            <span
              className="annotation-editor-item__color"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
          )}
          <span className="annotation-editor-item__icon-chip">
            <AnnotationIcon
              subtype={item.subtype}
              icon={item.icon}
              className="annotation-editor-item__icon"
            />
          </span>
          <div className="annotation-editor-item__main">
            <div className="annotation-editor-item__contents">{displayText}</div>
            <div className="annotation-editor-item__meta">
              {item.author && <span className="annotation-editor-item__author">{item.author}</span>}
              <span className="annotation-editor-item__page">
                {t('annotationEditor.page', { page: item.pageNumber })}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="annotation-editor-item__toggle"
            aria-label={t(expanded ? 'annotationEditor.collapse' : 'annotationEditor.expand')}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
          >
            <span className={`annotation-editor-item__chevron${expanded ? ' is-open' : ''}`}>
              ▾
            </span>
          </button>
        </div>
      )}

      {expanded && !editing && (
        <div className="annotation-editor-item__details">
          <div className="annotation-editor-item__field">
            <span className="annotation-editor-item__label">{t('annotationEditor.contents')}</span>
            <span className="annotation-editor-item__value">
              {item.contents || t('annotationEditor.emptyContents')}
            </span>
          </div>

          {(item.author || created) && (
            <div className="annotation-editor-item__meta-fields">
              {item.author && (
                <span className="annotation-editor-item__inline-field">
                  <span className="annotation-editor-item__label">
                    {t('annotationEditor.author')}
                  </span>
                  {authorOverflow ? (
                    <Tooltip label={item.author} align="start">
                      {authorNode}
                    </Tooltip>
                  ) : (
                    authorNode
                  )}
                  {authorCopied && (
                    <span className="annotation-editor-item__copy-hint">
                      {t('annotationEditor.copied')}
                    </span>
                  )}
                </span>
              )}
              {created && (
                <span className="annotation-editor-item__inline-field">
                  <span className="annotation-editor-item__label">
                    {t('annotationEditor.created')}
                  </span>
                  <span className="annotation-editor-item__value">{created}</span>
                </span>
              )}
            </div>
          )}

          {modified && (
            <div className="annotation-editor-item__field">
              <span className="annotation-editor-item__label">
                {t('annotationEditor.modified')}
              </span>
              <span className="annotation-editor-item__value">{modified}</span>
            </div>
          )}

          {item.subtype === 'Text' && (
            <div className="annotation-editor-item__icon-picker">
              <span className="annotation-editor-item__label">
                {t('annotationEditor.chooseIcon')}
              </span>
              <div className="annotation-editor-item__icon-options">
                {TEXT_ICON_OPTIONS.map((option) => {
                  const label = t(annotationIconLabelKey(option.name))
                  const active = (item.icon ?? 'Note') === option.name
                  return (
                    <button
                      key={option.name}
                      type="button"
                      className={`annotation-editor-item__icon-option${active ? ' is-active' : ''}`}
                      onClick={() => onIconChange(option.name)}
                      disabled={readOnly}
                      title={label}
                      aria-label={label}
                      aria-pressed={active}
                    >
                      <img src={option.src} alt="" width="18" height="18" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="annotation-editor-item__actions">
            <button
              type="button"
              className="annotation-editor-item__action"
              onClick={copyContents}
              disabled={!item.contents}
            >
              {t(copied ? 'annotationEditor.copied' : 'annotationEditor.copy')}
            </button>
            <button type="button" className="annotation-editor-item__action" onClick={onSelect}>
              {t('annotationEditor.locate')}
            </button>
            {canEdit && (
              <button
                type="button"
                className="annotation-editor-item__action"
                onClick={onEditStart}
                disabled={readOnly}
              >
                {t('annotationEditor.edit')}
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className="annotation-editor-item__action"
                onClick={onRelocate}
                disabled={readOnly}
              >
                {t('annotationEditor.relocate')}
              </button>
            )}
            <button
              type="button"
              className="annotation-editor-item__action is-danger"
              onClick={() => onDelete()}
              disabled={readOnly}
            >
              {t('annotationEditor.delete')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
