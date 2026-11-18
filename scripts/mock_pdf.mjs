#!/usr/bin/env node
/**
 * mock_pdf.mjs — 生成用于测试 / 演示的 PDF 文件
 * ==================================================
 * 纯 Node 脚本，不依赖任何测试框架，可直接用 CLI 调用：
 *
 *   node scripts/mock_pdf.mjs --kind text --pages 3 --out out.pdf
 *
 * 为什么需要它：
 *   手工准备「带表单 / 带链接 / 多页 / 纯文字」等特征 PDF 很麻烦，
 *   这里统一生成，方便按 TEST.md 的清单逐项验证。
 *
 * 实现说明：
 *   - 只用 pdf-lib（已在 devDependencies 里），不新增依赖。
 *   - 「图片页」需要真实的位图，这里用 node:zlib 现场压一个最小 PNG，
 *     避免为了造图再引入图像库。
 *   - pdf-lib 的 `context.obj()` 会把普通字符串转成 PDF **Name**，
 *     所以写 `/URI` 这类字符串必须用 `PDFString.of(...)`，
 *     而 `/Subtype`、`/S` 这类必须用 `PDFName.of(...)`。踩过坑，别改。
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 所有支持的 PDF 种类 */
export const PDF_KINDS = ['text', 'image', 'blank', 'links', 'forms', 'outline', 'mixed', 'pages']

/** 各种类的中文说明（--help 与 --list 共用） */
const KIND_DESCRIPTIONS = {
  text: '纯文字页：标题 + 若干行正文（验证文本层 / 搜索 / 复制）',
  image: '含图片页：内嵌 PNG 位图（验证图像渲染）',
  blank: '空白页：只有页面边框（验证空白页处理）',
  links: '链接页：外链 + 内部页跳转（验证注解层链接可点）',
  forms: '表单页：文本框 / 复选框 / 下拉框（验证表单可填）',
  outline: '带目录页：含 /Outlines 书签树（验证目录面板）',
  mixed: '混合页：以上要素按页组合（默认）',
  pages: '多页文档：指定页数的纯文字页（验证分批加载 / 懒加载）',
}

/** 默认页面尺寸（A4，单位 pt） */
const DEFAULT_PAGE_SIZE = { width: 595, height: 842 }

/** 版心左边距 */
const MARGIN = 60

// ---------------------------------------------------------------------------
// 最小 PNG 生成（不引入图像库）
// ---------------------------------------------------------------------------

/** 计算 CRC32（PNG chunk 校验用） */
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** 把「类型 + 数据」拼成一个 PNG chunk */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

/**
 * 生成一张纯色对角渐变的 PNG。
 *
 * 手写 PNG 是为了「页面里真的有一张位图」——纯矢量图形无法验证
 * 图像解码路径，而 pdf-lib 又不能直接画栅格。
 */
function createTestPng(width = 240, height = 160) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR：宽高 + 8bit 深度 + 颜色类型 2（truecolor RGB）
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // 原始扫描数据：每行 1 字节 filter 标记 + width * 3 字节像素
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // filter type: None
    for (let x = 0; x < width; x++) {
      // 简单的对角渐变，肉眼能明显看出图是否正常渲染
      raw[offset++] = Math.round((x / width) * 255)
      raw[offset++] = Math.round((y / height) * 255)
      raw[offset++] = 160
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// 页面绘制辅助
// ---------------------------------------------------------------------------

/**
 * 创建文档与字体，返回后续绘制要用的上下文。
 */
async function createContext() {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  return { doc, regular, bold, mono }
}

/**
 * 画页面标题。
 * @param {object} p PDFPage
 * @param {object} font pdf-lib 字体
 * @param {string} text 标题文字
 */
function drawTitle(p, font, text) {
  p.drawText(text, {
    x: MARGIN,
    y: DEFAULT_PAGE_SIZE.height - 70,
    size: 20,
    font,
    color: rgb(0.12, 0.16, 0.32),
  })
}

/**
 * 画若干行正文。
 * @param {object} p PDFPage
 * @param {object} font pdf-lib 字体
 * @param {string[]} lines 每行文字
 * @param {number} startY 起始 y（pt）
 * @param {number} lineHeight 行高（pt）
 */
function drawLines(p, font, lines, startY = 730, lineHeight = 26) {
  lines.forEach((line, i) => {
    p.drawText(line, {
      x: MARGIN,
      y: startY - i * lineHeight,
      size: 11,
      font,
      color: rgb(0.2, 0.2, 0.24),
    })
  })
}

/** 画页脚页码 */
function drawFooter(p, font, pageNumber, total) {
  p.drawText(`${pageNumber} / ${total}`, {
    x: DEFAULT_PAGE_SIZE.width - MARGIN - 40,
    y: 30,
    size: 9,
    font,
    color: rgb(0.55, 0.55, 0.6),
  })
}

// ---------------------------------------------------------------------------
// 各种页的生成器
// ---------------------------------------------------------------------------

/** 纯文字页 */
function buildTextPage(p, fonts, pageNumber, total) {
  drawTitle(p, fonts.bold, `Text Page ${pageNumber}`)
  drawLines(p, fonts.regular, [
    'The quick brown fox jumps over the lazy dog.',
    'Pack my box with five dozen liquor jugs.',
    'How vexingly quick daft zebras jump!',
    'Sphinx of black quartz, judge my vow.',
    '',
    `This is body text line ${pageNumber}.1 — used for text layer / selection tests.`,
    `This is body text line ${pageNumber}.2 — used for search tests.`,
    `Repeatable keyword: PDF Everything mock ${pageNumber}.`,
  ])
  drawFooter(p, fonts.regular, pageNumber, total)
}

/** 含图片页 */
async function buildImagePage(p, fonts, pageNumber, total) {
  const png = createTestPng()
  const image = await p.doc.embedPng(png)

  drawTitle(p, fonts.bold, `Image Page ${pageNumber}`)
  p.drawText('Embedded raster image (PNG, 240x160):', {
    x: MARGIN,
    y: 730,
    size: 11,
    font: fonts.regular,
    color: rgb(0.2, 0.2, 0.24),
  })
  p.drawImage(image, { x: MARGIN, y: 500, width: 240, height: 160 })
  drawLines(
    p,
    fonts.regular,
    [
      'If the gradient image above renders, image decoding works.',
      'This page is useful for verifying large-image and memory behaviour.',
    ],
    440,
  )
  drawFooter(p, fonts.regular, pageNumber, total)
}

/** 空白页（只有一个淡色边框，用于区分「空白」与「没渲染」） */
function buildBlankPage(p, fonts, pageNumber, total) {
  drawTitle(p, fonts.bold, `Blank Page ${pageNumber}`)
  p.drawRectangle({
    x: MARGIN,
    y: 120,
    width: DEFAULT_PAGE_SIZE.width - MARGIN * 2,
    height: 520,
    borderColor: rgb(0.8, 0.8, 0.85),
    borderWidth: 1,
  })
  p.drawText('(intentionally empty)', {
    x: DEFAULT_PAGE_SIZE.width / 2 - 52,
    y: 370,
    size: 11,
    font: fonts.regular,
    color: rgb(0.6, 0.6, 0.65),
  })
  drawFooter(p, fonts.regular, pageNumber, total)
}

/**
 * 链接页：外链 + 内部跳转。
 *
 * 注意：pdf-lib 的 `context.obj()` 把普通字符串转成 PDF **Name**，
 * 所以 `/URI` 的值必须显式用 `PDFString.of(...)`，
 * 而 `/Subtype`、`/S` 必须是 `PDFName.of(...)`。
 */
function buildLinkPage(doc, p, fonts, pageNumber, total) {
  const internalTarget = (pageNumber % total) + 1 // 跳到下一页，末页回到第 1 页

  drawTitle(p, fonts.bold, `Links Page ${pageNumber}`)
  p.drawText('External link (opens new tab) ->', {
    x: MARGIN,
    y: 730,
    size: 11,
    font: fonts.regular,
    color: rgb(0.05, 0.1, 0.6),
  })
  p.drawText(`Internal link to page ${internalTarget} ->`, {
    x: MARGIN,
    y: 700,
    size: 11,
    font: fonts.regular,
    color: rgb(0.05, 0.1, 0.6),
  })
  drawLines(
    p,
    fonts.regular,
    [
      'The two lines above are link annotations.',
      `The second one should navigate to page ${internalTarget}.`,
    ],
    650,
  )

  // addLink 只能一次加一个注解，且必须传 PDFRef
  const addLink = (dict) => {
    p.node.addAnnot(doc.context.register(doc.context.obj(dict)))
  }

  // 外链
  addLink({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [MARGIN, 722, MARGIN + 200, 744],
    Border: [0, 0, 0],
    A: { S: PDFName.of('URI'), URI: PDFString.of('https://example.com/') },
  })

  // 内部跳转：Dest 指向后面生成的页面引用（稍后回填）
  addLink({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [MARGIN, 692, MARGIN + 200, 714],
    Border: [0, 0, 0],
    Dest: [doc.getPage(internalTarget - 1).ref, PDFName.of('Fit')],
  })

  drawFooter(p, fonts.regular, pageNumber, total)
}

/** 表单页：文本框 + 复选框 + 下拉框 */
function buildFormPage(p, fonts, pageNumber, total) {
  const form = p.doc.getForm()

  drawTitle(p, fonts.bold, `Form Page ${pageNumber}`)
  drawLines(
    p,
    fonts.regular,
    [
      'Fill the controls below, then zoom or change page.',
      'Values should survive re-render (annotation storage).',
    ],
    740,
  )

  const label = (text, y) =>
    p.drawText(text, {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.regular,
      color: rgb(0.2, 0.2, 0.24),
    })

  // 文本输入框
  label('Name:', 640)
  const nameField = form.createTextField(`name_${pageNumber}`)
  nameField.setText(`Page ${pageNumber}`)
  nameField.addToPage(p, { x: MARGIN + 60, y: 632, width: 220, height: 22 })

  // 多行文本域
  label('Notes:', 596)
  const notesField = form.createTextField(`notes_${pageNumber}`)
  notesField.enableMultiline()
  notesField.addToPage(p, { x: MARGIN + 60, y: 560, width: 220, height: 60 })

  // 复选框
  label('Agree:', 520)
  const checkBox = form.createCheckBox(`agree_${pageNumber}`)
  checkBox.addToPage(p, { x: MARGIN + 60, y: 514, width: 16, height: 16 })

  // 下拉框
  label('Option:', 476)
  const dropdown = form.createDropdown(`option_${pageNumber}`)
  dropdown.addOptions(['Alpha', 'Beta', 'Gamma'])
  dropdown.select('Beta')
  dropdown.addToPage(p, { x: MARGIN + 60, y: 468, width: 160, height: 22 })

  drawFooter(p, fonts.regular, pageNumber, total)
}

/**
 * 带 /Outlines 书签树的页面。
 *
 * pdf-lib 没有高层 API，只能手搓：
 * 每个 item 需要 Title / Parent / Dest，父节点还要 First / Last / Count。
 */
function buildOutlinePage(p, fonts, pageNumber, total) {
  drawTitle(p, fonts.bold, `Outline Page ${pageNumber}`)
  drawLines(p, fonts.regular, [
    'This document carries a /Outlines bookmark tree.',
    'Use the toolbar outline button to verify the panel.',
  ])
  drawFooter(p, fonts.regular, pageNumber, total)
}

/**
 * 构造 /Outlines 书签树。
 * @param {object} doc PDFDocument
 * @param {Array<{title: string, pageIndex: number, children?: any[]}>} items
 */
function addOutlineTree(doc, items) {
  const { context } = doc

  const buildItems = (list, parentRef) =>
    list.map((item) => {
      const pageRef = doc.getPage(item.pageIndex).ref
      const dict = context.obj({
        Title: PDFString.of(item.title),
        Dest: [pageRef, PDFName.of('Fit')],
      })
      const itemRef = context.register(dict)
      // Parent 指向根节点（这里只做一层嵌套，够用且不容易错）
      if (parentRef) dict.set(PDFName.of('Parent'), parentRef)
      return { ref: itemRef, dict, children: item.children }
    })

  const root = context.obj({ Type: PDFName.of('Outlines') })
  const rootRef = context.register(root)

  const built = buildItems(items, rootRef)

  // 串成双向链表：Prev / Next / First / Last
  built.forEach((node, i) => {
    const children = node.children?.length ? buildItems(node.children, node.ref) : []

    if (children.length) {
      node.dict.set(PDFName.of('First'), children[0].ref)
      node.dict.set(PDFName.of('Last'), children[children.length - 1].ref)
      node.dict.set(PDFName.of('Count'), context.obj(children.length))
      children.forEach((child, j) => {
        if (j > 0) child.dict.set(PDFName.of('Prev'), children[j - 1].ref)
        if (j < children.length - 1) child.dict.set(PDFName.of('Next'), children[j + 1].ref)
      })
    }

    if (i > 0) node.dict.set(PDFName.of('Prev'), built[i - 1].ref)
    if (i < built.length - 1) node.dict.set(PDFName.of('Next'), built[i + 1].ref)
  })

  if (built.length) {
    root.set(PDFName.of('First'), built[0].ref)
    root.set(PDFName.of('Last'), built[built.length - 1].ref)
    root.set(PDFName.of('Count'), context.obj(built.length))
  }

  doc.catalog.set(PDFName.of('Outlines'), rootRef)
  return rootRef
}

// ---------------------------------------------------------------------------
// 文档组装
// ---------------------------------------------------------------------------

/**
 * 按 kind 生成完整文档。
 *
 * @param {string} kind 种类（见 PDF_KINDS）
 * @param {number} pages 页数（部分种类会忽略）
 * @returns {Promise<Uint8Array>} PDF 字节
 */
export async function buildMockPdf(kind = 'mixed', pages = 3) {
  const { doc, regular, bold, mono } = await createContext()
  const fonts = { regular, bold, mono }
  const total = Math.max(1, Math.floor(pages))

  // 先把所有页面建出来，这样链接 / 书签可以引用后面的页
  const pageRefs = []
  for (let i = 0; i < total; i++) {
    pageRefs.push(doc.addPage([DEFAULT_PAGE_SIZE.width, DEFAULT_PAGE_SIZE.height]))
  }

  // 逐页填内容
  for (let i = 0; i < total; i++) {
    const p = pageRefs[i]
    const pageNumber = i + 1
    // 记录 doc 引用，供表单 / 图片页使用
    p.doc = doc

    switch (kind) {
      case 'text':
        buildTextPage(p, fonts, pageNumber, total)
        break
      case 'image':
        await buildImagePage(p, fonts, pageNumber, total)
        break
      case 'blank':
        buildBlankPage(p, fonts, pageNumber, total)
        break
      case 'links':
        buildLinkPage(doc, p, fonts, pageNumber, total)
        break
      case 'forms':
        buildFormPage(p, fonts, pageNumber, total)
        break
      case 'outline':
        buildOutlinePage(p, fonts, pageNumber, total)
        break
      case 'pages':
        buildTextPage(p, fonts, pageNumber, total)
        break
      case 'mixed':
      default:
        // 混合模式：首页链接 + 表单，中间图片，其余文字，最后一页空白
        if (pageNumber === 1) {
          buildLinkPage(doc, p, fonts, pageNumber, total)
          buildFormPage(p, fonts, pageNumber, total)
        } else if (pageNumber === 2) {
          await buildImagePage(p, fonts, pageNumber, total)
        } else if (pageNumber === total) {
          buildBlankPage(p, fonts, pageNumber, total)
        } else {
          buildTextPage(p, fonts, pageNumber, total)
        }
        break
    }
  }

  // 目录 / 混合模式补上 /Outlines
  if (kind === 'outline' || kind === 'mixed') {
    addOutlineTree(doc, [
      { title: 'Cover', pageIndex: 0 },
      {
        title: 'Details',
        pageIndex: Math.min(1, total - 1),
        children: [
          { title: 'Sub 1.1', pageIndex: Math.min(1, total - 1) },
          { title: 'Sub 1.2', pageIndex: Math.min(2, total - 1) },
        ],
      },
      { title: 'Last page', pageIndex: total - 1 },
    ])
  }

  return doc.save()
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** 帮助文本 */
function printHelp() {
  const kindLines = PDF_KINDS.map((k) => `  ${k.padEnd(9)}${KIND_DESCRIPTIONS[k]}`).join('\n')

  console.log(`mock_pdf.mjs — 生成用于测试 / 演示的 PDF

用法:
  node scripts/mock_pdf.mjs [选项]

选项:
  -k, --kind <name>    PDF 种类（默认 mixed）
  -p, --pages <n>      页数（默认 3）
  -o, --out <path>     输出路径（默认 ./mock.pdf）
  --list               列出所有种类后退出
  -h, --help           显示本帮助

可选的 kind:
${kindLines}

示例:
  # 3 页纯文字
  node scripts/mock_pdf.mjs -k text -p 3 -o text.pdf

  # 60 页多页文档（验证分批加载 / 懒加载）
  node scripts/mock_pdf.mjs -k pages -p 60 -o big.pdf

  # 带链接与表单的混合文档
  node scripts/mock_pdf.mjs -k mixed -p 3 -o mixed.pdf

  # 带目录书签的文档
  node scripts/mock_pdf.mjs -k outline -p 3 -o outline.pdf

说明:
  - 生成后建议用 \`pnpm dev\` 打开应用，拖入文件按 TEST.md 逐项核对。

覆盖范围:
  [有] 未嵌入标准字体 —— pdf-lib 的 StandardFonts 本就是 base-14 不嵌入
  [有] 文本层 / 链接 / 表单 / 目录 / 多页 / 位图（PNG）

不覆盖（是 pdf-lib 的编码器缺口，不是格式本身只能解码）:
  [无] JBIG2 / JPEG2000 —— 需 jbig2enc / opj_compress 先编码，或用 img2pdf 嵌入
  [无] CJK 预定义 CMap 的非嵌入字体 —— 需 Ghostscript(-dEmbedAllFonts=false) / LibreOffice
  [无] 加密 PDF —— pdf-lib 不支持；可用 qpdf / pypdf / PyMuPDF 生成
  [无] 真实大文档 —— 页数能造（-p 3000），但没有真实大文档的体积与结构特征

注意:
  pdf.js 的 useSystemFonts 默认 true，本机有 Helvetica 时可能根本不 fetch
  standard_fonts/。要强制走该路径，需在应用侧设 useSystemFonts: false。
`)
}

/** 解析命令行参数（不引入第三方库） */
function parseArgs(argv) {
  const options = { kind: 'mixed', pages: 3, out: './mock.pdf', list: false, help: false }
  const takesValue = new Set(['-k', '--kind', '-p', '--pages', '-o', '--out'])

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '-h' || arg === '--help') options.help = true
    else if (arg === '--list') options.list = true
    else if (takesValue.has(arg)) {
      const value = argv[++i]
      if (value === undefined) {
        throw new Error(`参数 ${arg} 缺少取值`)
      }
      if (arg === '-k' || arg === '--kind') options.kind = value
      else if (arg === '-p' || arg === '--pages') options.pages = Number(value)
      else options.out = value
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数: ${arg}`)
    } else {
      throw new Error(`多余的位置参数: ${arg}`)
    }
  }

  return options
}

/** 主入口 */
export async function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(`错误: ${error.message}\n`)
    console.error('用 --help 查看用法。\n')
    process.exit(1)
  }

  if (options.help) {
    printHelp()
    return
  }

  if (options.list) {
    console.log('可选的 kind:\n')
    for (const kind of PDF_KINDS) {
      console.log(`  ${kind.padEnd(9)}${KIND_DESCRIPTIONS[kind]}`)
    }
    return
  }

  // 校验输入
  if (!PDF_KINDS.includes(options.kind)) {
    console.error(`错误: 未知种类 "${options.kind}"\n可选: ${PDF_KINDS.join(', ')}\n`)
    process.exit(1)
  }

  if (!Number.isFinite(options.pages) || options.pages < 1) {
    console.error(`错误: --pages 必须是 >= 1 的整数（收到 ${options.pages}）\n`)
    process.exit(1)
  }

  const bytes = await buildMockPdf(options.kind, options.pages)
  writeFileSync(options.out, bytes)

  console.log(`已生成 ${options.out}（${options.kind}，${options.pages} 页，${bytes.length} 字节）`)
}

// 仅在被直接执行时跑 CLI；被 import 时不自动执行
const isDirectRun =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(`生成失败: ${error?.stack ?? error}`)
    process.exit(1)
  })
}
