/**
 * `src/components/annotationEditor` 的公共类型声明。
 *
 * 实现位于同目录的 `.ts` / `.tsx` 文件中；本文件集中声明目录对外暴露的 API。
 */

export { AnnotationEditor } from './AnnotationEditor'
export type { AnnotationEditorProps } from './AnnotationEditor'

export { AnnotationEditorButton } from './AnnotationEditorButton'
export type { AnnotationEditorButtonProps } from './AnnotationEditorButton'

export { AnnotationItem } from './AnnotationItem'
export type { AnnotationItemProps } from './AnnotationItem'

export {
  AnnotationIcon,
  getAnnotationGhostSrc,
  getAnnotationIcon,
  TEXT_ICON_OPTIONS,
} from './AnnotationIcon'
export type {
  AnnotationIconDescriptor,
  AnnotationIconOption,
  AnnotationIconProps,
} from './AnnotationIcon'

export { useAnnotations } from './useAnnotations'
export type { UseAnnotationsOptions, UseAnnotationsResult } from './useAnnotations'

export {
  annotationDisplayText,
  annotationIconLabelKey,
  annotationTypeLabelKey,
  filterAnnotations,
  normalizeAnnotation,
  sortAnnotations,
} from './annotationTypes'
export type { AnnotationListItem, AnnotationScope, RawPdfAnnotation } from './annotationTypes'
