import { useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

import { useFocusTrap } from '../lib/useFocusTrap'
import { formatPageSizeBoth, type SizeGroup } from '../lib/pageSize'

interface PageSizeBreakdownProps {
  /** 尺寸分组（每组一个代表页），最多 10 项 */
  groups: SizeGroup[]
  onClose: () => void
}

/** 页面尺寸明细弹窗：列出最多 10 种尺寸与代表页（pt + mm 双单位） */
export function PageSizeBreakdown({ groups, onClose }: PageSizeBreakdownProps) {
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
      aria-labelledby="page-size-title"
    >
      <div className="modal-content modal-content--small" ref={modalRef}>
        <div className="modal-header">
          <h2 id="page-size-title">{t('modal.pageSizes')}</h2>
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
          <ul className="page-size-list">
            {groups.map((group) => (
              <li key={group.page}>
                <span className="page-size-list__value">
                  {formatPageSizeBoth(group.size, t('modal.approx'))}
                </span>
                <span className="page-size-list__page">{t('modal.page', { n: group.page })}</span>
              </li>
            ))}
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
