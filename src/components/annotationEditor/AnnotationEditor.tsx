import { useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import annotationCommentIcon from 'pdfjs-dist/web/images/annotation-comment.svg'
import { AnnotationItem } from './AnnotationItem'
import { getAnnotationGhostSrc } from './AnnotationIcon'
import { useAnnotationEditing, type PdfRect } from './useAnnotationEditing'
import { useAnnotations } from './useAnnotations'
import { ENCRYPTED_PDF } from './pdfAnnotationOps'
import type { AnnotationListItem, AnnotationScope } from './annotationTypes'

/** 转义属性选择器中的特殊字符，避免注解 id 破坏 CSS 选择器 */
const escapeAttribute = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

type Placement =
  | { kind: 'add'; pageNumber?: number; rect?: PdfRect }
  | { kind: 'relocate'; item: AnnotationListItem }

/** 编辑重载后要重新定位/展开的注解 */
type PendingFocus =
  | { kind: 'id'; id: string }
  | { kind: 'match'; pageNumber: number; contents: string; author: string }

export interface AnnotationEditorProps {
  /** PDF 文档代理 */
  pdfDoc: PDFDocumentProxy | null
  /** 已加载的页面代理 */
  pages: PDFPageProxy[]
  /** 当前页（1-based） */
  currentPage: number
  /** 原始 PDF 文件，用于增删改后重新加载 */
  file: File | null
  /** 文档标识：仅在打开新文件时变化，用于区分「新文件」与「编辑后重载」 */
  documentKey?: number
  /** 是否显示面板 */
  visible: boolean
  /** 关闭面板 */
  onClose: () => void
  /** 跳转到指定页（1-based） */
  onGotoPage: (pageNumber: number) => void
  /** 注解被增删改后，由 PdfViewer 负责用新字节重新加载 PDF */
  onModified: (bytes: Uint8Array) => void | Promise<void>
}

/**
 * 注解面板（AnnotationEditor）。
 *
 * 查看 / 定位 / 新增 / 编辑 / 删除 / 重新定位：
 * - 新增和重新定位共用「放置模式」：点击页面选点，屏幕坐标换算为 PDF 坐标；
 * - 当前页 / 全部页两种范围；
 * - 注解类型图标（复用 ContextEditor 图标 + pdf.js 自带 annotation-*.svg）；
 * - 点击条目定位到页面，并在注解层短暂高亮；
 * - 增删改会用 pdf-lib 修改 PDF 字节，再通过 onModified 让 PdfViewer 重新加载。
 */
export function AnnotationEditor({
  pdfDoc,
  pages,
  currentPage,
  file,
  documentKey = 0,
  visible,
  onClose,
  onGotoPage,
  onModified,
}: AnnotationEditorProps) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<AnnotationScope>('current')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addContents, setAddContents] = useState('')
  const [addAuthor, setAddAuthor] = useState('')
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [justChangedId, setJustChangedId] = useState<string | null>(null)

  const markerRef = useRef<HTMLDivElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const pendingFocusRef = useRef<PendingFocus | null>(null)

  const { items, loading, error, reload } = useAnnotations({
    pdfDoc,
    pages,
    currentPage,
    scope,
  })

  const {
    addAnnotation,
    deleteAnnotation,
    editAnnotation,
    relocateAnnotation,
    setAnnotationIcon,
    loading: editingLoading,
    error: editingError,
  } = useAnnotationEditing(file, onModified)

  const isLoading = loading || editingLoading
  // 加密 PDF 无法安全写回，转为友好提示并禁用编辑能力
  const encrypted = editingError === ENCRYPTED_PDF
  const displayError = encrypted ? null : error || editingError

  const clearMarker = () => {
    markerRef.current?.remove()
    markerRef.current = null
  }

  const cancelPlacement = () => {
    clearMarker()
    clearGhost()
    setPlacement(null)
  }

  const clearGhost = () => {
    ghostRef.current?.remove()
    ghostRef.current = null
  }

  const hideGhost = () => {
    if (ghostRef.current) ghostRef.current.style.display = 'none'
  }

  const ensureGhost = (src: string): HTMLDivElement => {
    let el = ghostRef.current
    if (!el) {
      el = document.createElement('div')
      el.className = 'annotation-place-ghost'
      const img = document.createElement('img')
      img.alt = ''
      el.appendChild(img)
      document.body.appendChild(el)
      ghostRef.current = el
    }
    const img = el.firstElementChild as HTMLImageElement | null
    if (img && img.getAttribute('src') !== src) img.src = src
    return el
  }

  const moveGhost = (host: HTMLElement, clientX: number, clientY: number) => {
    const current = placement
    // 已经选好点（新增表单已打开）时不再跟随鼠标
    if (!current || (current.kind === 'add' && current.rect)) {
      hideGhost()
      return
    }
    const src =
      current.kind === 'relocate'
        ? getAnnotationGhostSrc(current.item.subtype, current.item.icon)
        : getAnnotationGhostSrc('Text', 'Comment')
    const el = ensureGhost(src)
    const box = host.getBoundingClientRect()
    if (box.width < 26 || box.height < 26) {
      hideGhost()
      return
    }
    const half = 13
    const x = Math.min(Math.max(clientX, box.left + half), box.right - half)
    const y = Math.min(Math.max(clientY, box.top + half), box.bottom - half)
    el.style.display = 'flex'
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }

  // 换文档时清空选中 / 展开 / 编辑 / 放置状态
  useEffect(() => {
    setSelectedId(null)
    setExpandedId(null)
    setEditingId(null)
    setPlacement(null)
    clearMarker()
    clearGhost()
    pendingFocusRef.current = null
    setJustChangedId(null)
  }, [documentKey])

  // 操作失败时不要保留「待定位」状态，避免下次刷新跳到无关条目
  useEffect(() => {
    if (editingError) pendingFocusRef.current = null
  }, [editingError])

  // 放置模式：拦截页面点击、Esc 取消、光标变十字
  useEffect(() => {
    if (!placement || !pdfDoc) return

    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'crosshair'

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest('.annotation-editor-panel')) return

      const host = target.closest('.pdf-page-canvas') as HTMLElement | null
      if (!host) return

      event.preventDefault()
      event.stopPropagation()
      void choosePoint(host, event.clientX, event.clientY)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelPlacement()
    }

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target || target.closest('.annotation-editor-panel')) {
        hideGhost()
        return
      }
      const host = target.closest('.pdf-page-canvas') as HTMLElement | null
      if (!host) {
        hideGhost()
        return
      }
      moveGhost(host, event.clientX, event.clientY)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.body.style.cursor = previousCursor
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('keydown', onKeyDown, true)
      clearGhost()
    }
    // choosePoint 依赖当前 placement，placement 变化时重建监听即可
  }, [placement, pdfDoc, pages])

  useEffect(
    () => () => {
      clearMarker()
      clearGhost()
    },
    [],
  )

  // 关闭面板时退出放置模式，避免监听残留
  useEffect(() => {
    if (visible) return
    setPlacement(null)
    clearMarker()
    clearGhost()
  }, [visible])

  const showMarker = (host: HTMLElement, clientX: number, clientY: number) => {
    clearMarker()
    const box = host.getBoundingClientRect()
    if (!box.width || !box.height) return
    const marker = document.createElement('div')
    marker.className = 'annotation-place-marker'
    marker.style.left = `${((clientX - box.left) / box.width) * 100}%`
    marker.style.top = `${((clientY - box.top) / box.height) * 100}%`
    host.appendChild(marker)
    markerRef.current = marker
  }

  const rectAtPoint = (x: number, y: number, source?: PdfRect): PdfRect => {
    const width = source ? Math.max(8, Math.abs(source[2] - source[0])) : 20
    const height = source ? Math.max(8, Math.abs(source[3] - source[1])) : 20
    return [x - width / 2, y - height / 2, x + width / 2, y + height / 2]
  }

  const choosePoint = async (host: HTMLElement, clientX: number, clientY: number) => {
    const pageNumber = Number(host.dataset.pageNumber)
    const current = placement
    if (!pageNumber || !pdfDoc || !current) return

    // 暂不支持跨页移动：重新定位仅在原页内生效
    if (current.kind === 'relocate' && pageNumber !== current.item.pageNumber) return

    let page = pages[pageNumber - 1]
    if (!page) {
      try {
        page = await pdfDoc.getPage(pageNumber)
      } catch {
        return
      }
    }

    const hostRotation = Number(host.dataset.rotation ?? 0)
    const baseViewport = page.getViewport({ scale: 1, rotation: hostRotation })
    const box = host.getBoundingClientRect()
    // 用实际渲染宽度反推每页 scale：oversize 页也成立
    const scale = baseViewport.width ? box.width / baseViewport.width : 1
    const renderViewport = page.getViewport({ scale, rotation: hostRotation })
    const [pdfX, pdfY] = renderViewport.convertToPdfPoint(clientX - box.left, clientY - box.top)
    hideGhost()
    showMarker(host, clientX, clientY)

    if (current.kind === 'add') {
      setPlacement({ kind: 'add', pageNumber, rect: rectAtPoint(pdfX, pdfY) })
      return
    }

    const rect = rectAtPoint(pdfX, pdfY, current.item.rect)
    cancelPlacement()
    pendingFocusRef.current = { kind: 'id', id: current.item.id }
    await relocateAnnotation(current.item.pageNumber, current.item.index, rect)
  }

  // 选中注解后，在注解层对应元素上短暂加高亮
  useEffect(() => {
    if (!selectedId) return

    let timer: number | undefined
    let attempts = 0
    let element: Element | null = null

    const apply = () => {
      element = document.querySelector(`[data-annotation-id="${escapeAttribute(selectedId)}"]`)
      if (!element) {
        // 目标页可能还在懒加载，短暂重试几次
        if (attempts++ < 12) {
          timer = window.setTimeout(apply, 100)
        }
        return
      }
      element.classList.add('annotation--selected')
      timer = window.setTimeout(() => {
        element?.classList.remove('annotation--selected')
      }, 1600)
    }

    apply()

    return () => {
      if (timer) window.clearTimeout(timer)
      element?.classList.remove('annotation--selected')
    }
  }, [selectedId, currentPage, items])

  // 编辑重载后 items 会短暂为空再恢复；为空时不清选中，避免闪烁
  useEffect(() => {
    if (!items.length) return
    const exists = (id: string | null) => id === null || items.some((item) => item.id === id)
    if (!exists(selectedId)) setSelectedId(null)
    if (!exists(expandedId)) setExpandedId(null)
    if (!exists(editingId)) setEditingId(null)
  }, [items, selectedId, expandedId, editingId])

  // 操作完成后重新定位到「刚改的那一条」并自动展开
  useEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending || !items.length) return

    const target =
      pending.kind === 'id'
        ? items.find((item) => item.id === pending.id)
        : items.find(
            (item) =>
              item.pageNumber === pending.pageNumber &&
              item.contents === pending.contents &&
              item.author === pending.author,
          )
    if (!target) return

    pendingFocusRef.current = null
    setSelectedId(target.id)
    setExpandedId(target.id)
    setEditingId(null)
    setJustChangedId(target.id)
  }, [items])

  // 高亮刚改的条目并滚动到可视区域
  useEffect(() => {
    if (!justChangedId) return
    const element = document.querySelector(
      `[data-annotation-key="${escapeAttribute(justChangedId)}"]`,
    )
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const timer = window.setTimeout(() => setJustChangedId(null), 1600)
    return () => window.clearTimeout(timer)
  }, [justChangedId])

  if (!visible) return null

  const handleSelect = (item: AnnotationListItem) => {
    setSelectedId(item.id)
    setExpandedId(item.id)
    if (item.pageNumber !== currentPage) {
      onGotoPage(item.pageNumber)
    }
  }

  const handleToggle = (item: AnnotationListItem) => {
    setExpandedId((current) => (current === item.id ? null : item.id))
  }

  const handleEditSave = async (
    pageNumber: number,
    index: number,
    contents: string,
    author: string,
  ) => {
    if (editingId) pendingFocusRef.current = { kind: 'id', id: editingId }
    await editAnnotation(pageNumber, index, contents, author)
    setEditingId(null)
  }

  const handleDelete = async (item: AnnotationListItem) => {
    if (!window.confirm(t('annotationEditor.confirmDelete'))) return
    await deleteAnnotation(item.pageNumber, item.index)
  }

  const handleIconChange = async (item: AnnotationListItem, iconName: string) => {
    pendingFocusRef.current = { kind: 'id', id: item.id }
    await setAnnotationIcon(item.pageNumber, item.index, iconName)
  }

  const startAddPlacement = () => {
    if (placement?.kind === 'add') {
      cancelPlacement()
      return
    }
    setEditingId(null)
    setPlacement({ kind: 'add' })
  }

  const startRelocate = (item: AnnotationListItem) => {
    setEditingId(null)
    setSelectedId(item.id)
    setPlacement({ kind: 'relocate', item })
    if (item.pageNumber !== currentPage) {
      onGotoPage(item.pageNumber)
    }
  }

  const handleAdd = async () => {
    if (!addContents.trim()) return
    if (placement?.kind !== 'add' || !placement.pageNumber || !placement.rect) return
    pendingFocusRef.current = {
      kind: 'match',
      pageNumber: placement.pageNumber,
      contents: addContents,
      author: addAuthor,
    }
    await addAnnotation(placement.pageNumber, addContents, addAuthor, placement.rect)
    setAddContents('')
    setAddAuthor('')
    cancelPlacement()
  }

  const addPlacing = placement?.kind === 'add'
  const addPointReady = addPlacing && Boolean(placement.rect)
  const placingHint =
    placement?.kind === 'relocate'
      ? t('annotationEditor.placingRelocateHint')
      : addPlacing && !addPointReady
        ? t('annotationEditor.placingAddHint')
        : null

  return (
    <aside className="annotation-editor-panel" aria-label={t('annotationEditor.title')}>
      <div className="annotation-editor-panel__header">
        <div className="annotation-editor-panel__heading">
          <span className="annotation-editor-panel__badge">
            <img src={annotationCommentIcon} alt="" width="18" height="18" />
          </span>
          <span className="annotation-editor-panel__title-block">
            <span className="annotation-editor-panel__title">{t('annotationEditor.title')}</span>
            <span className="annotation-editor-panel__subtitle">
              {t('annotationEditor.count', { count: items.length })}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="annotation-editor-panel__close"
          onClick={onClose}
          aria-label={t('annotationEditor.close')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="annotation-editor-panel__toolbar">
        <div className="annotation-editor-panel__segmented" role="tablist">
          <button
            type="button"
            role="tab"
            className={scope === 'current' ? 'is-active' : ''}
            onClick={() => setScope('current')}
            aria-selected={scope === 'current'}
          >
            {t('annotationEditor.currentPage')}
          </button>
          <button
            type="button"
            role="tab"
            className={scope === 'all' ? 'is-active' : ''}
            onClick={() => setScope('all')}
            aria-selected={scope === 'all'}
          >
            {t('annotationEditor.allPages')}
          </button>
        </div>
        <button
          type="button"
          className="annotation-editor-panel__icon-btn"
          onClick={reload}
          aria-label={t('annotationEditor.reload')}
          title={t('annotationEditor.reload')}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>

      {encrypted && (
        <div className="annotation-editor-panel__notice" role="status">
          {t('annotationEditor.encrypted')}
        </div>
      )}

      {placingHint && (
        <div className="annotation-editor-panel__placing" role="status">
          <span>{placingHint}</span>
          <button type="button" onClick={cancelPlacement}>
            {t('annotationEditor.cancel')}
          </button>
        </div>
      )}

      <div className="annotation-editor-panel__add">
        <button
          type="button"
          className={`annotation-editor-panel__add-toggle${addPlacing ? ' is-open' : ''}`}
          onClick={startAddPlacement}
          aria-expanded={addPlacing}
          disabled={encrypted || placement?.kind === 'relocate'}
        >
          <span className="annotation-editor-panel__add-plus" aria-hidden="true">
            {addPlacing ? '×' : '+'}
          </span>
          {addPlacing ? t('annotationEditor.cancel') : t('annotationEditor.add')}
        </button>

        {addPointReady && placement?.kind === 'add' && (
          <div className="annotation-editor-add-form">
            <textarea
              className="annotation-editor-add-form__textarea"
              value={addContents}
              onInput={(e) => setAddContents(e.currentTarget.value)}
              placeholder={t('annotationEditor.addContentsPlaceholder')}
              rows={3}
            />
            <input
              className="annotation-editor-add-form__author"
              value={addAuthor}
              onInput={(e) => setAddAuthor(e.currentTarget.value)}
              placeholder={t('annotationEditor.authorPlaceholder')}
            />
            <div className="annotation-editor-add-form__actions">
              <button
                type="button"
                className="annotation-editor-item__action is-primary"
                onClick={handleAdd}
                disabled={encrypted || !addContents.trim()}
              >
                {t('annotationEditor.save')}
              </button>
              <button
                type="button"
                className="annotation-editor-item__action"
                onClick={cancelPlacement}
              >
                {t('annotationEditor.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {isLoading && items.length === 0 && (
        <div className="annotation-editor-panel__state">
          <span className="annotation-editor-panel__spinner" aria-hidden="true" />
          {t('annotationEditor.loading')}
        </div>
      )}

      {displayError && (
        <div className="annotation-editor-panel__state annotation-editor-panel__state--error">
          {displayError}
        </div>
      )}

      {!isLoading && !displayError && items.length === 0 && (
        <div className="annotation-editor-panel__state annotation-editor-panel__state--empty">
          <span className="annotation-editor-panel__empty-icon" aria-hidden="true">
            💬
          </span>
          {t('annotationEditor.empty')}
          <span className="annotation-editor-panel__empty-hint">
            {t('annotationEditor.emptyHint')}
          </span>
        </div>
      )}

      <ul className="annotation-editor-panel__list">
        {items.map((item) => (
          <AnnotationItem
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            expanded={expandedId === item.id}
            editing={editingId === item.id}
            readOnly={encrypted}
            justChanged={justChangedId === item.id}
            onSelect={() => handleSelect(item)}
            onToggle={() => handleToggle(item)}
            onEditStart={() => {
              setEditingId(item.id)
              setExpandedId(item.id)
            }}
            onEditSave={(pageNumber, index, contents, author) =>
              handleEditSave(pageNumber, index, contents, author)
            }
            onEditCancel={() => setEditingId(null)}
            onRelocate={() => startRelocate(item)}
            onIconChange={(iconName) => handleIconChange(item, iconName)}
            onDelete={() => handleDelete(item)}
          />
        ))}
      </ul>
    </aside>
  )
}
