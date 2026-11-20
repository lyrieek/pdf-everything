import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useTranslation } from 'react-i18next'
import * as pdfjsLib from 'pdfjs-dist'

import { Tooltip } from './Tooltip'
import { TimeValue } from './TimeValue'
import { PageSizeBreakdown } from './PageSizeBreakdown'
import { FontListModal } from './FontListModal'
import { useFocusTrap } from '../lib/useFocusTrap'
import { parsePdfDate, formatDate } from '../lib/pdfDate'
import { buildIni, copyToClipboard, type PropertyItem } from '../lib/propertyExport'
import { usePageSizes } from '../lib/usePageSizes'
import { usePerPageSize } from '../lib/usePerPageSize'
import { useLinearized } from '../lib/useLinearized'
import { usePdfFonts, FONT_PREVIEW_LIMIT } from '../lib/usePdfFonts'
import { splitSubsetPrefix } from '../lib/pdfFonts'
import './PropBtn.css'

interface PropBtnProps {
  /** PDF 文档代理 */
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  /** 页面数组 */
  pages: pdfjsLib.PDFPageProxy[]
  /** 文件名（来自上传的文件） */
  fileName?: string
  /** 当前阅读页（1-based），用于「当前页尺寸」 */
  currentPage?: number
  /** 总页数，用于「平均每页占用」与「所有页尺寸」判定 */
  numPages?: number
  /** 原始文件，用于「平均每页占用」的精确元数据解析与线性化检测；缺省则不计算 */
  file?: File | null
}

interface DisplayItem extends PropertyItem {
  /** 若提供则用它渲染值（时间戳的 tooltip、加载骨架等） */
  node?: ComponentChildren
  /** 若提供则在键名旁加 Tooltip 说明（如计算口径、概念解释） */
  labelTooltip?: string
  /** 键名 Tooltip 的弹出位置，默认 bottom（靠近弹窗底部的行用 top 避免被滚动区域裁剪） */
  labelTooltipPlacement?: 'top' | 'bottom'
}

interface DisplayGroup {
  title: string
  items: DisplayItem[]
}

/** PDF 属性按钮 - 点击打开属性模态框 */
export function PropBtn({ pdfDoc, pages, fileName, currentPage, numPages, file }: PropBtnProps) {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  const fileNameRef = useRef(fileName)
  const copyTimer = useRef<number | undefined>(undefined)

  // 判断值是否为未知
  const isUnknown = (value?: string) => !value || value === t('modal.unknown')
  const formatValue = (value?: string) => value || t('modal.unknown')

  // 更新文件名引用
  useEffect(() => {
    fileNameRef.current = fileName
  }, [fileName])

  // 获取 PDF 元数据
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    pdfDoc
      .getMetadata()
      .then((data) => {
        if (cancelled) return
        // pdf.js 的 getMetadata() 返回 { info, metadata }，
        // 其中 info 是文档信息字典（普通对象），键名已是标准形式：
        // Title / Author / Subject / Creator / Producer / CreationDate / ModDate …
        const info = data.info as Record<string, unknown> | null
        const meta: Record<string, string> = {}
        if (info && typeof info === 'object' && !Array.isArray(info)) {
          for (const [key, value] of Object.entries(info)) {
            // 仅保留字符串值，跳过布尔/数字等非展示字段（如 IsAcroFormPresent）
            if (typeof value === 'string') meta[key] = value
          }
        }
        setMetadata(meta)
      })
      .catch(() => {
        if (!cancelled) setMetadata({})
      })
    return () => {
      cancelled = true
    }
  }, [pdfDoc])

  // 使用上传的文件名，如果没有则回退到 metadata.Title
  const displayFileName = fileNameRef.current || metadata.Title
  const author = metadata.Author
  const subject = metadata.Subject
  const creator = metadata.Creator
  const producer = metadata.Producer
  const creationDateObj = parsePdfDate(metadata.CreationDate)
  const modificationDateObj = parsePdfDate(metadata.ModDate)
  const creationDate = creationDateObj
    ? formatDate(creationDateObj, i18n.language)
    : metadata.CreationDate
  const modificationDate = modificationDateObj
    ? formatDate(modificationDateObj, i18n.language)
    : metadata.ModDate

  const totalPages = numPages ?? pdfDoc?.numPages ?? pages.length

  const { pageSize, sizeGroups, scanning, computeAll, closeBreakdown } = usePageSizes({
    pdfDoc,
    pages,
    currentPage,
    totalPages,
    isOpen,
  })
  const { perPageState, perPageText } = usePerPageSize({ file, totalPages, isOpen })
  const { linearized, linearizedState } = useLinearized({ file, isOpen })
  const { fonts, fontsState, fontModalOpen, openFontModal, closeFontModal, showMore } = usePdfFonts(
    { pdfDoc, totalPages, isOpen },
  )

  // 修改时间缺失，或与创建时间相同，则隐藏「修改时间」（渲染与复制都生效，因为共用 groups）
  const hideModified = !modificationDate || creationDate === modificationDate

  // 平均每页占用未算出时：仅该行显示加载骨架，不影响其他属性行
  const perPageNode: ComponentChildren =
    perPageState === 'calculating' ? (
      <span className="loading-inline" role="status" aria-label={t('modal.calculating')} />
    ) : undefined

  // 线性化检测中：仅该行显示加载骨架；检测不到文件（无 file）时显示未知
  const linearizedNode: ComponentChildren =
    linearizedState === 'calculating' ? (
      <span className="loading-inline" role="status" aria-label={t('modal.calculating')} />
    ) : undefined
  const linearizedText =
    linearized == null ? undefined : linearized ? t('modal.yes') : t('modal.no')

  // 时间值：展示绝对时间，hover 显示实时相对时间（多久之前）
  const creationNode: ComponentChildren = creationDateObj ? (
    <TimeValue absolute={creationDate ?? ''} date={creationDateObj} locale={i18n.language} />
  ) : undefined
  const modificationNode: ComponentChildren = modificationDateObj ? (
    <TimeValue
      absolute={modificationDate ?? ''}
      date={modificationDateObj}
      locale={i18n.language}
    />
  ) : undefined

  // 「当前页尺寸」的值右侧放「计算所有页」按钮（仅当前页尺寸时显示）
  const pageSizeNode: ComponentChildren = (
    <span className="page-size-cell">
      <span>{formatValue(pageSize.value)}</span>
      {pageSize.canCompute && (
        <button type="button" className="btn-link" onClick={computeAll} disabled={scanning}>
          {scanning ? t('modal.calculating') : t('modal.computeAll')}
        </button>
      )}
    </span>
  )

  // 字体值：扫描中显示骨架；否则每个字体带嵌入/子集标签，超过 3 个时右侧给「更多字体」按钮
  const fontsNode: ComponentChildren =
    fontsState === 'calculating' ? (
      <span className="loading-inline" role="status" aria-label={t('modal.calculating')} />
    ) : (
      <span className="font-preview">
        {fonts.slice(0, FONT_PREVIEW_LIMIT).map((font) => {
          const [subsetPrefix, fontName] = splitSubsetPrefix(font.name)
          return (
            <span key={font.name} className="font-item">
              <span className="font-item__name">
                {subsetPrefix && <span className="font-item__name--subset">{subsetPrefix}</span>}
                {fontName}
              </span>
              {font.embedded && <span className="font-tag">{t('modal.embedded')}</span>}
              {font.subset && (
                <span className="font-tag font-tag--subset">{t('modal.subset')}</span>
              )}
            </span>
          )
        })}
        {showMore && (
          <button type="button" className="btn-link" onClick={openFontModal}>
            {t('modal.moreFonts')}
          </button>
        )}
      </span>
    )

  // 属性条目：渲染与「复制」共用同一份数据，键名/分组标题随当前语言
  const infoItems: DisplayItem[] = [
    { label: t('modal.fileName'), value: displayFileName },
    { label: t('modal.version'), value: metadata.PDFFormatVersion },
    {
      label: t('modal.linearized'),
      value: linearizedState === 'calculating' ? t('modal.calculating') : linearizedText,
      node: linearizedNode,
      labelTooltip: t('modal.linearizedTip'),
    },
    { label: t('modal.author'), value: author },
    { label: t('modal.subject'), value: subject },
    { label: t('modal.creator'), value: creator },
    { label: t('modal.producer'), value: producer },
    {
      label: t('modal.fonts'),
      value: fonts.length > 0 ? fonts.map((font) => font.name).join(', ') : undefined,
      node: fontsNode,
    },
    { label: t('modal.created'), value: creationDate, node: creationNode },
    ...(hideModified
      ? []
      : [{ label: t('modal.modified'), value: modificationDate, node: modificationNode }]),
    { label: pageSize.label, value: pageSize.value, node: pageSizeNode },
  ]

  const groups: DisplayGroup[] = [
    { title: t('modal.documentInfo'), items: infoItems },
    {
      title: t('modal.documentStats'),
      items: [
        { label: t('modal.pages'), value: String(totalPages) },
        {
          label: t('modal.avgPerPage'),
          value: perPageText,
          node: perPageNode,
          labelTooltip: t('modal.avgPerPageTip'),
          labelTooltipPlacement: 'top',
        },
      ],
    },
  ]

  // 复制：序列化为 INI 写入剪贴板；成功显示「已复制」，失败显示「复制失败」
  const handleCopy = async () => {
    const ok = await copyToClipboard(buildIni(groups, t('modal.unknown')))
    setCopyStatus(ok ? 'copied' : 'failed')
    if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopyStatus('idle'), ok ? 1500 : 2000)
  }

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const handleOverlayClick = useCallback((e: MouseEvent) => {
    if (e.target === e.currentTarget) setIsOpen(false)
  }, [])

  // 焦点管理：Tab 循环限制在模态框内、Escape 关闭、关闭后焦点还原到触发按钮
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeModal = useCallback(() => setIsOpen(false), [])

  useFocusTrap({
    active: isOpen && !!pdfDoc && !sizeGroups && !fontModalOpen,
    containerRef: modalRef,
    onEscape: closeModal,
    returnFocusRef: triggerRef,
  })

  return (
    <>
      <Tooltip label={t('aria.properties')} align="end">
        <button
          ref={triggerRef}
          className="icon-btn"
          onClick={() => setIsOpen(true)}
          disabled={!pdfDoc}
          aria-label={t('aria.properties')}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </Tooltip>

      {isOpen && pdfDoc && (
        <div
          ref={modalRef}
          className="modal-overlay"
          onClick={handleOverlayClick}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="properties-title"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h2 id="properties-title">{t('modal.title')}</h2>
              <Tooltip label={t('aria.closeModal')} align="end">
                <button
                  className="modal-close"
                  onClick={() => setIsOpen(false)}
                  aria-label={t('aria.closeModal')}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </Tooltip>
            </div>
            <div className="modal-body">
              {groups.map((group) => (
                <div className="property-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <dl className="properties-list">
                    {group.items.map((item) => (
                      <div className="property-row" key={item.label}>
                        <dt>
                          {item.labelTooltip ? (
                            <Tooltip
                              label={item.labelTooltip}
                              align="start"
                              wrap
                              placement={item.labelTooltipPlacement ?? 'bottom'}
                            >
                              <span className="label-tip" tabIndex={0}>
                                {item.label}
                              </span>
                            </Tooltip>
                          ) : (
                            item.label
                          )}
                        </dt>
                        <dd className={isUnknown(item.value) ? 'unknown' : ''}>
                          {item.node ?? formatValue(item.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button
                className={`btn btn-secondary${copyStatus === 'failed' ? ' is-error' : ''}`}
                onClick={handleCopy}
              >
                {copyStatus === 'copied'
                  ? t('modal.copied')
                  : copyStatus === 'failed'
                    ? t('modal.copyFailed')
                    : t('modal.copy')}
              </button>
              <button className="btn btn-primary" onClick={() => setIsOpen(false)}>
                {t('modal.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sizeGroups && <PageSizeBreakdown groups={sizeGroups} onClose={closeBreakdown} />}
      {fontModalOpen && <FontListModal fonts={fonts} onClose={closeFontModal} />}
    </>
  )
}
