import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import * as pdfjsLib from 'pdfjs-dist'

import { Tooltip } from './Tooltip'
import { useFocusTrap } from '../lib/useFocusTrap'
import './PropBtn.css'

interface PropBtnProps {
  /** PDF 文档代理 */
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  /** 页面数组 */
  pages: pdfjsLib.PDFPageProxy[]
  /** 当前缩放比例 */
  scale: number
  /** 文件名（来自上传的文件） */
  fileName?: string
}

/** PDF 属性按钮 - 点击打开属性模态框 */
export function PropBtn({ pdfDoc, pages, scale, fileName }: PropBtnProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  const fileNameRef = useRef(fileName)

  // 更新文件名引用
  useEffect(() => {
    fileNameRef.current = fileName
  }, [fileName])

  // 获取 PDF 元数据
  useEffect(() => {
    if (pdfDoc) {
      pdfDoc.getMetadata().then((data) => {
        const info = data.info
        const meta: Record<string, string> = {}
        if (Array.isArray(info)) {
          for (const item of info) {
            if (item && typeof item === 'object') {
              for (const [key, value] of Object.entries(item)) {
                // PDF.js 返回的键可能是小写或大写，统一转为标准形式
                const normalizedKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
                meta[normalizedKey] = value as string
              }
            }
          }
        }
        setMetadata(meta)
      })
    }
  }, [pdfDoc])

  // 使用上传的文件名，如果没有则回退到 metadata.Title
  const displayFileName = fileNameRef.current || metadata.Title
  const author = metadata.Author
  const subject = metadata.Subject
  const creator = metadata.Creator
  const producer = metadata.Producer
  const creationDate = metadata.CreationDate
  const modificationDate = metadata.ModDate

  const handleOverlayClick = useCallback((e: MouseEvent) => {
    if (e.target === e.currentTarget) setIsOpen(false)
  }, [])

  // 焦点管理：Tab 循环限制在模态框内、Escape 关闭、关闭后焦点还原到触发按钮
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeModal = useCallback(() => setIsOpen(false), [])

  useFocusTrap({
    active: isOpen && !!pdfDoc,
    containerRef: modalRef,
    onEscape: closeModal,
    returnFocusRef: triggerRef,
  })

  // 判断值是否为未知
  const isUnknown = (value?: string) => !value || value === t('modal.unknown')
  const formatValue = (value?: string) => value || t('modal.unknown')

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
              <div className="property-group">
                <h3>{t('modal.documentInfo')}</h3>
                <dl className="properties-list">
                  <div className="property-row">
                    <dt>{t('modal.fileName')}</dt>
                    <dd className={isUnknown(displayFileName) ? 'unknown' : ''}>
                      {formatValue(displayFileName)}
                    </dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.author')}</dt>
                    <dd className={isUnknown(author) ? 'unknown' : ''}>{formatValue(author)}</dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.subject')}</dt>
                    <dd className={isUnknown(subject) ? 'unknown' : ''}>{formatValue(subject)}</dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.creator')}</dt>
                    <dd className={isUnknown(creator) ? 'unknown' : ''}>{formatValue(creator)}</dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.producer')}</dt>
                    <dd className={isUnknown(producer) ? 'unknown' : ''}>
                      {formatValue(producer)}
                    </dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.created')}</dt>
                    <dd className={isUnknown(creationDate) ? 'unknown' : ''}>
                      {formatValue(creationDate)}
                    </dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.modified')}</dt>
                    <dd className={isUnknown(modificationDate) ? 'unknown' : ''}>
                      {formatValue(modificationDate)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="property-group">
                <h3>{t('modal.documentStats')}</h3>
                <dl className="properties-list">
                  <div className="property-row">
                    <dt>{t('modal.pages')}</dt>
                    <dd>{pages.length}</dd>
                  </div>
                  <div className="property-row">
                    <dt>{t('modal.currentZoom')}</dt>
                    <dd>{Math.round(scale * 100)}%</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsOpen(false)}>
                {t('modal.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
