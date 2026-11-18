import { useState, useEffect } from 'preact/hooks'
import * as pdfjsLib from 'pdfjs-dist'

interface OutlinePanelProps {
  /** PDF 文档代理 */
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  /** 目录项点击回调（目标页码，1-based） */
  onGoto: (pageNumber: number) => void
  /** 是否可见 */
  visible: boolean
}

type OutlineNode = {
  title: string
  pageNumber: number
  items: OutlineNode[]
}

/** 扁平化 PDF outline 为可渲染的树 */
async function flattenOutline(doc: pdfjsLib.PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await doc.getOutline()
  if (!raw) return []

  async function resolve(items: typeof raw): Promise<OutlineNode[]> {
    const result: OutlineNode[] = []
    for (const item of items) {
      let pageNumber = 0
      if (item.dest && typeof item.dest === 'string') {
        const explicit = await doc.getDestination(item.dest)
        if (explicit && explicit[0] != null) {
          pageNumber = (explicit[0] as number) + 1
        }
      } else if (Array.isArray(item.dest) && item.dest[0] != null) {
        pageNumber = (item.dest[0] as number) + 1
      }
      const children = item.items?.length ? await resolve(item.items) : []
      result.push({ title: item.title, pageNumber, items: children })
    }
    return result
  }

  return resolve(raw)
}

function OutlineItem({
  node,
  depth,
  onGoto,
}: {
  node: OutlineNode
  depth: number
  onGoto: (n: number) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)

  if (!node.title) return null

  const hasChildren = node.items.length > 0

  return (
    <li className="outline-item">
      <div
        className="outline-row"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) setExpanded((e) => !e)
          else if (node.pageNumber > 0) onGoto(node.pageNumber)
        }}
      >
        {hasChildren ? (
          <span className="outline-toggle">{expanded ? '▾' : '▸'}</span>
        ) : (
          <span className="outline-spacer" />
        )}
        <span className="outline-title">{node.title}</span>
        {node.pageNumber > 0 && <span className="outline-page">p.{node.pageNumber}</span>}
      </div>
      {expanded && hasChildren && (
        <ul className="outline-children">
          {node.items.map((child, i) => (
            <OutlineItem key={i} node={child} depth={depth + 1} onGoto={onGoto} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** 目录侧栏 */
export function OutlinePanel({ pdfDoc, onGoto, visible }: OutlinePanelProps) {
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pdfDoc) {
      setOutline([])
      return
    }
    setLoading(true)
    flattenOutline(pdfDoc)
      .then(setOutline)
      .catch(() => setOutline([]))
      .finally(() => setLoading(false))
  }, [pdfDoc])

  if (!visible) return null

  return (
    <div className="outline-panel">
      <div className="outline-header">目录</div>
      {loading && <div className="outline-loading">加载中...</div>}
      {!loading && outline.length === 0 && <div className="outline-empty">此 PDF 无目录</div>}
      {outline.length > 0 && (
        <ul className="outline-root">
          {outline.map((node, i) => (
            <OutlineItem key={i} node={node} depth={0} onGoto={onGoto} />
          ))}
        </ul>
      )}
    </div>
  )
}
