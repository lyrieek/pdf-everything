import type { JSX } from 'preact'
import annotationCheck from 'pdfjs-dist/web/images/annotation-check.svg'
import annotationComment from 'pdfjs-dist/web/images/annotation-comment.svg'
import annotationHelp from 'pdfjs-dist/web/images/annotation-help.svg'
import annotationInsert from 'pdfjs-dist/web/images/annotation-insert.svg'
import annotationKey from 'pdfjs-dist/web/images/annotation-key.svg'
import annotationNewParagraph from 'pdfjs-dist/web/images/annotation-newparagraph.svg'
import annotationNoIcon from 'pdfjs-dist/web/images/annotation-noicon.svg'
import annotationNote from 'pdfjs-dist/web/images/annotation-note.svg'
import annotationPaperclip from 'pdfjs-dist/web/images/annotation-paperclip.svg'
import annotationParagraph from 'pdfjs-dist/web/images/annotation-paragraph.svg'
import annotationPushpin from 'pdfjs-dist/web/images/annotation-pushpin.svg'
import { FreeTextIcon, HighlightIcon, InkIcon } from '../contextEditor/icons'

type IconComponent = () => JSX.Element

/** 图标描述：要么复用 ContextEditor 的组件图标，要么使用 pdf.js 自带的 SVG */
export type AnnotationIconDescriptor =
  | { kind: 'component'; component: IconComponent }
  | { kind: 'image'; src: string }

/** 复用 ContextEditor 的图标组件 */
const COMPONENT_ICONS: Record<string, IconComponent> = {
  FreeText: FreeTextIcon,
  Highlight: HighlightIcon,
  Ink: InkIcon,
}

/** Text 注解 `/Name` 名称 → pdf.js 自带图片 */
const TEXT_ICON_IMAGES: Record<string, string> = {
  Comment: annotationComment,
  Key: annotationKey,
  Help: annotationHelp,
  NewParagraph: annotationNewParagraph,
  Paragraph: annotationParagraph,
  Insert: annotationInsert,
  Note: annotationNote,
  Paperclip: annotationPaperclip,
  PushPin: annotationPushpin,
  Check: annotationCheck,
}

export interface AnnotationIconOption {
  /** 写入 PDF `/Name` 的值 */
  name: string
  /** 预览图 */
  src: string
}

/** 可供 Text 注解切换的图标（全部来自 pdfjs-dist/web/images） */
export const TEXT_ICON_OPTIONS: AnnotationIconOption[] = [
  { name: 'Comment', src: annotationComment },
  { name: 'Note', src: annotationNote },
  { name: 'Help', src: annotationHelp },
  { name: 'Key', src: annotationKey },
  { name: 'NewParagraph', src: annotationNewParagraph },
  { name: 'Paragraph', src: annotationParagraph },
  { name: 'Insert', src: annotationInsert },
  { name: 'Paperclip', src: annotationPaperclip },
  { name: 'PushPin', src: annotationPushpin },
  { name: 'Check', src: annotationCheck },
]

/** 注解子类型 → pdf.js 自带图片 */
const SUBTYPE_IMAGES: Record<string, string> = {
  Text: annotationComment,
  Stamp: annotationNote,
  FileAttachment: annotationPaperclip,
  Link: annotationInsert,
  Caret: annotationInsert,
  Sound: annotationNote,
  Movie: annotationInsert,
  Screen: annotationInsert,
  Square: annotationNoIcon,
  Circle: annotationNoIcon,
  Line: annotationNoIcon,
  Polyline: annotationNoIcon,
  Polygon: annotationNoIcon,
  PrinterMark: annotationNoIcon,
  Watermark: annotationNoIcon,
  Unknown: annotationNoIcon,
}

/** 取注解图标描述 */
export function getAnnotationIcon(subtype: string, icon?: string): AnnotationIconDescriptor {
  const Component = COMPONENT_ICONS[subtype]
  if (Component) return { kind: 'component', component: Component }

  if (subtype === 'Text' && icon) {
    const image = TEXT_ICON_IMAGES[icon]
    if (image) return { kind: 'image', src: image }
  }

  return { kind: 'image', src: SUBTYPE_IMAGES[subtype] ?? annotationNoIcon }
}

/** 取可渲染到 <img> 的图标地址（组件图标回退到 comment 图片） */
export function getAnnotationGhostSrc(subtype: string, icon?: string): string {
  const descriptor = getAnnotationIcon(subtype, icon)
  return descriptor.kind === 'image' ? descriptor.src : annotationComment
}

export interface AnnotationIconProps {
  subtype: string
  icon?: string
  className?: string
}

/** 渲染注解图标 */
export function AnnotationIcon({ subtype, icon, className }: AnnotationIconProps) {
  const descriptor = getAnnotationIcon(subtype, icon)

  if (descriptor.kind === 'component') {
    const Component = descriptor.component
    return (
      <span className={className} aria-hidden="true">
        <Component />
      </span>
    )
  }

  return <img className={className} src={descriptor.src} alt="" width="18" height="18" />
}
