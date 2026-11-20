import { useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

import { useFocusTrap } from '../lib/useFocusTrap'
import type { PdfFont } from '../lib/pdfFonts'
import { splitSubsetPrefix } from '../lib/pdfFonts'

interface FontListModalProps {
  /** 字体列表（最多 50 个） */
  fonts: PdfFont[]
  onClose: () => void
}

/** 字体列表弹窗：显示最多 50 个字体名，嵌入字体带标签 */
export function FontListModal({ fonts, onClose }: FontListModalProps) {
  const { t } = useTranslation()
  const modalRef = useRef<HTMLDivElement>(null)

  useFocusTrap({ active: true, containerRef: modalRef, onEscape: onClose })

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="font-list-title"
    >
      <div className="modal-content modal-content--small" ref={modalRef}>
        <div className="modal-header">
          <h2 id="font-list-title">
            {t('modal.fonts')} · {fonts.length}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label={t('aria.closeModal')}>
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
        </div>
        <div className="modal-body">
          <ul className="font-list">
            {fonts.map((font) => {
              const [subsetPrefix, fontName] = splitSubsetPrefix(font.name)
              return (
                <li key={font.name}>
                  <span className="font-list__name">
                    {subsetPrefix && (
                      <span className="font-list__name--subset">{subsetPrefix}</span>
                    )}
                    {fontName}
                  </span>
                  {font.embedded && <span className="font-tag">{t('modal.embedded')}</span>}
                  {font.subset && (
                    <span className="font-tag font-tag--subset">{t('modal.subset')}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="modal-footer modal-footer--end">
          <button className="btn btn-primary" onClick={onClose}>
            {t('modal.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
