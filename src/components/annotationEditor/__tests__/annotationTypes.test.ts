import { describe, it, expect } from 'vitest'
import {
  annotationDisplayText,
  annotationIconLabelKey,
  annotationTypeLabelKey,
  filterAnnotations,
  normalizeAnnotation,
  sortAnnotations,
} from '../annotationTypes'
import { getAnnotationGhostSrc, getAnnotationIcon, TEXT_ICON_OPTIONS } from '../AnnotationIcon'

describe('normalizeAnnotation', () => {
  it('映射 contents / author / color / 日期 / 页码', () => {
    const item = normalizeAnnotation(
      {
        id: '7R',
        subtype: 'Text',
        icon: 'Comment',
        contentsObj: { str: 'hello', dir: 'ltr' },
        titleObj: { str: 'Alice', dir: 'ltr' },
        creationDate: 'D:20240101120000',
        modificationDate: 'D:20240102120000',
        color: [1, 0, 0],
        isEditable: true,
      },
      2,
      0,
    )

    expect(item).toMatchObject({
      id: '7R',
      pageIndex: 2,
      pageNumber: 3,
      subtype: 'Text',
      icon: 'Comment',
      contents: 'hello',
      author: 'Alice',
      creationDate: 'D:20240101120000',
      modificationDate: 'D:20240102120000',
      color: '#ff0000',
      isEditable: true,
    })
  })

  it('兼容字符串形式的 contents / title', () => {
    const item = normalizeAnnotation(
      { id: 1, subtype: 'FreeText', contents: 'note', title: 'Bob' },
      0,
      0,
    )

    expect(item.contents).toBe('note')
    expect(item.author).toBe('Bob')
    expect(item.pageNumber).toBe(1)
    expect(item.color).toBeUndefined()
  })
})

describe('filterAnnotations', () => {
  it('过滤 Popup 与 Widget', () => {
    const items = [
      { subtype: 'Text' },
      { subtype: 'Popup' },
      { subtype: 'Widget' },
      { subtype: 'Highlight' },
    ] as Parameters<typeof filterAnnotations>[0]

    expect(filterAnnotations(items).map((item) => item.subtype)).toEqual(['Text', 'Highlight'])
  })
})

describe('sortAnnotations', () => {
  it('按页码、创建时间排序', () => {
    const items = [
      { pageNumber: 2, creationDate: 'D:20240101000000' },
      { pageNumber: 1, creationDate: 'D:20240102000000' },
      { pageNumber: 1, creationDate: 'D:20240101000000' },
    ] as Parameters<typeof sortAnnotations>[0]

    expect(sortAnnotations(items).map((item) => `${item.pageNumber}:${item.creationDate}`)).toEqual(
      ['1:D:20240101000000', '1:D:20240102000000', '2:D:20240101000000'],
    )
  })
})

describe('annotationTypeLabelKey', () => {
  it('已知子类型返回对应 key，未知返回 typeUnknown', () => {
    expect(annotationTypeLabelKey('Highlight')).toBe('annotationEditor.typeHighlight')
    expect(annotationTypeLabelKey('Nope')).toBe('annotationEditor.typeUnknown')
  })
})

describe('annotationIconLabelKey', () => {
  it('已知图标名返回对应 key，未知回退到 comment', () => {
    expect(annotationIconLabelKey('Key')).toBe('annotationEditor.iconKey')
    expect(annotationIconLabelKey('PushPin')).toBe('annotationEditor.iconPushPin')
    expect(annotationIconLabelKey('Nope')).toBe('annotationEditor.iconComment')
  })
})

describe('normalizeAnnotation 的 rect / name', () => {
  it('解析 /Rect 并把 /Name 作为图标名', () => {
    const item = normalizeAnnotation(
      {
        id: '3R',
        subtype: 'Text',
        name: 'PushPin',
        rect: [10, 20, 30, 40],
      },
      0,
      1,
    )
    expect(item.rect).toEqual([10, 20, 30, 40])
    expect(item.icon).toBe('PushPin')
    expect(item.index).toBe(1)
  })

  it('rect 非法时忽略', () => {
    const item = normalizeAnnotation({ id: '1R', subtype: 'Highlight', rect: ['x'] }, 0, 0)
    expect(item.rect).toBeUndefined()
  })
})

describe('annotationDisplayText', () => {
  it('有内容用内容，否则用类型名', () => {
    expect(annotationDisplayText({ contents: 'hello' } as never, 'Text')).toBe('hello')
    expect(annotationDisplayText({ contents: '  ' } as never, 'Text')).toBe('Text')
  })
})

describe('getAnnotationIcon', () => {
  it('复用 ContextEditor 组件图标', () => {
    expect(getAnnotationIcon('Highlight').kind).toBe('component')
    expect(getAnnotationIcon('FreeText').kind).toBe('component')
    expect(getAnnotationIcon('Ink').kind).toBe('component')
  })

  it('Text 注解按 icon 使用 pdf.js 自带图片', () => {
    expect(getAnnotationIcon('Text', 'Comment')).toEqual({
      kind: 'image',
      src: expect.stringContaining('annotation-comment.svg'),
    })
    expect(getAnnotationIcon('Text', 'Key')).toEqual({
      kind: 'image',
      src: expect.stringContaining('annotation-key.svg'),
    })
  })

  it('未知类型回退到 annotation-noicon.svg', () => {
    expect(getAnnotationIcon('Square')).toEqual({
      kind: 'image',
      src: expect.stringContaining('annotation-noicon.svg'),
    })
  })
})

describe('TEXT_ICON_OPTIONS', () => {
  it('提供 10 个可切换的 Text 图标', () => {
    expect(TEXT_ICON_OPTIONS).toHaveLength(10)
    expect(TEXT_ICON_OPTIONS.map((option) => option.name)).toEqual([
      'Comment',
      'Note',
      'Help',
      'Key',
      'NewParagraph',
      'Paragraph',
      'Insert',
      'Paperclip',
      'PushPin',
      'Check',
    ])
    for (const option of TEXT_ICON_OPTIONS) {
      expect(option.src).toContain('annotation-')
    }
  })
})

describe('getAnnotationGhostSrc', () => {
  it('Text 注解使用当前图标图片', () => {
    expect(getAnnotationGhostSrc('Text', 'PushPin')).toContain('annotation-pushpin.svg')
  })

  it('组件图标回退到 comment 图片', () => {
    expect(getAnnotationGhostSrc('Highlight')).toContain('annotation-comment.svg')
  })
})
