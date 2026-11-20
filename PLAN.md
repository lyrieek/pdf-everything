# PDF Everything — 待办计划

> 已完成的部分已移出本文档，见 [README.md](./README.md)（概览）、[FEATURE.md](./FEATURE.md)（实现细节）、[TEST.md](./TEST.md)（测试方法）。
> 本文只保留**尚未实现**的项，按优先级排序。

---

## 状态总览

| 优先级 | 事项 | 状态 |
| --- | --- | --- |
| P0 | 4 类资源基址 + 部署目录 | ✅ 已完成（移出本文档） |
| P1 | 渲染取消 / DPR / destroy / 错误分类 / 加密密码 / `%PDF` 校验 | ✅ 已完成（移出本文档） |
| P2 | 文本层、页码跳转、目录、分批取页 | ✅ 已完成（移出本文档） |
| P2 | **搜索、页面标签、worker 复用、`getDocument` 调优、移动端手势** | ⬜ 待做 |
| P2 | **qpdf 集成（解密后编辑、重新加密、线性化）** | ⬜ 待做 |
| P3 | 注解层、焦点管理 | ✅ 已完成（移出本文档） |
| P3 | **旋转、加载进度** | ✅ 已完成（移出本文档） |
| P3 | 注解编辑（查看 / 新增 / 编辑 / 删除 / 重新定位 / 图标） | ✅ 已完成（移出本文档） |
| P3 | **适配模式、下载打印** | ⬜ 待做 |
| P3 | **可访问性补齐** | ⬜ 部分完成 |
| — | 缩略图侧栏 | ⏸️ 已决策暂不做 |

---

## P2 — 检索与加载优化

### 1. 全文搜索（`Ctrl+F` + 高亮 + 跳转）

**现状**：文本层已就绪（文字可选中），但没有搜索。用户只能靠眼睛找。

**实现要点**：

| 环节 | 方案 |
| --- | --- |
| 文本索引 | 逐页 `page.getTextContent()`，结果缓存进 `WeakMap<PDFPageProxy, TextContent>` |
| 匹配算法 | 纯函数 `findMatches(text, query, { caseSensitive, wholeWord })` → `Array<[start, end]>` |
| 高亮 | 用 DOM `Range` 包裹文本层里的文本节点；或走 CSS Custom Highlight API（`CSS.highlights`） |
| UI | 工具栏搜索框 + `上一个 / 下一个` + `n / total` 计数 + 大小写/全词开关 |
| 跳转 | 命中后 `goToPage(物理页号)`，再滚动到首条命中的垂直位置 |
| 性能 | 大文档需分片异步建索引 + 输入防抖（150–250ms），避免每敲一个字重扫全文 |

**注意**：

- 文本层的 span 是按 PDF 文本块切的，**同一个词的字符可能跨多个 span**，Range 要跨节点处理。
- 高亮层要放在 canvas 之上、文本层之下，否则会挡住文字选择。

**验收**：`Ctrl+F` 聚焦搜索框；输入后显示 `3 / 17`；`Enter` / `Shift+Enter` 在命中间跳转；当前条高亮与其他条区分；切换到没有匹配的页时无报错。

---

### 2. 页面标签（`getPageLabels()`）

**现状**：页码显示的是物理序号（1..N）。含罗马数字前言（i–xii）的 PDF 显示不正确。

**实现要点**：

- 加载后取 `pdfDoc.getPageLabels()`，返回 `string[] | null`，与 `numPages` 一一对应。
- 页码指示、目录页码、双页布局的页脚、将来的缩略图统一走「标签优先，回退数字」的格式化函数。
- **标签只用于展示**，跳转、内部链接一律用物理页号，两者不要混用。

**验收**：带 `i–xii` 前言的 PDF，前言页显示罗马数字，正文页显示阿拉伯数字。

---

### 3. 复用 `PDFWorker`

**现状**：`getDocument` 不传 `worker`，pdf.js 每次换文件都新建一个 worker。

**实现要点**：

- 模块级持有一个 `PDFWorker`（`new pdfjsLib.PDFWorker({ port })` 或 `PDFWorker.fromPort`），
  `getDocument({ worker })` 复用。
- 卸载时统一 `worker.destroy()`；换文件**不要**销毁。
- 注意 `GlobalWorkerOptions.workerSrc` 与自建 `Worker` 只能二选一，混用会重复起线程。

**验收**：连续打开 5 个不同 PDF，DevTools → Application → Workers 只有 1 个 pdf 相关 worker；切换文件无明显卡顿。

---

### 4. `getDocument` 选项调优

**现状**：只传了 `data` + 资源基址 + `cMapPacked` + `useWasm`。

**候选参数**：

| 参数 | 作用 | 风险 |
| --- | --- | --- |
| `disableAutoFetch: true` | 不后台预取整份文件，配合分批取页降低首屏与内存压力 | 跨页跳转可能变慢（需要时再补 fetch） |
| `maxImageSize` | 限制单张图解码尺寸，防止超大图打爆内存 | 设太小会让高清图失真 |
| `enableHWA` | 启用硬件加速（浏览器支持时） | 部分环境反而更慢，需实测 |
| `canvasMaxAreaInBytes` | 限制单页 canvas 面积，保护超大页面 | 超限会降质渲染 |

**建议**：先只做 `disableAutoFetch` + `maxImageSize`，其余用真实大文档实测后再决定。

**验收**：上千页文档首屏时间下降；Network 面板不再一次性拉完整份文件；跨页跳转仍能正常显示。

---

### 5. 移动端手势

**现状**：只有滚轮缩放与键盘，触摸设备体验差。

**实现要点**：

- 双指捏合缩放：`touchstart` 记录两指距离，`touchmove` 按比例调整 `scale`（复用 `clampScale`）。
- 单指拖拽平移：在缩放 > 100% 时接管，否则交给容器滚动。
- 必须在阅读区设 `touch-action: none`，否则浏览器会抢走手势。
- 与现有 `Ctrl+滚轮` 逻辑共用一个 `setScale` 入口，避免两套缩放状态。

**验收**：手机 / 触摸板双指缩放生效；缩放后单指拖动可平移；不误触页面滚动。

---

## P3 — 显示与导出

### 6. 适配模式

**现状**：只有数值缩放（50%–300%），没有「适合宽度 / 适合页面 / 实际大小」。

**实现要点**：

| 模式 | 计算方式 |
| --- | --- |
| 实际大小 | `scale = 1` |
| 适合宽度 | `scale = 容器宽 / 页面宽`（按当前页或首页） |
| 适合页面 | `scale = min(容器宽/页宽, 容器高/页高)` |

- 需要监听容器 `ResizeObserver`，窗口尺寸变化时重算（注意与现有 `measure()` 合并，避免两套观察器打架）。
- 切换模式后缩放值随之变化，尽量保持当前阅读位置（用「当前页 + 页内比例」而非绝对 `scrollTop`）。

**验收**：切模式后缩放值正确；窗口缩放时自适应；滚动位置不发生大幅跳变。

---

### 7. 注解编辑（基础能力已完成）

**已完成**（实现细节见 [FEATURE.md 6.7 / 6.8](./FEATURE.md#67-注解面板annotationeditor)）：

- AnnotationEditor 右侧面板：当前页 / 全部页、图标、作者、页码、展开详情、复制、定位。
- 新增 Text 便签：**放置模式**点击页面选点（幽灵图标跟随鼠标、限制在页面视口内），Esc / 取消退出。
- 编辑内容 / 作者、删除、同页重新定位、切换 Text 注解图标（10 个 `annotation-*.svg`）。
- 改动通过 pdf-lib 写回 `/Annots`；重载保留面板状态并自动展开/闪烁刚修改项。
- 加密 PDF：友好提示 + 只读，不使用 `ignoreEncryption`。
- ContextEditor：pdf.js 编辑器层适配，支持高亮 / 自由文本 / 手绘、撤销/重做/删除。

**剩余**：

| 事项 | 说明 |
| --- | --- |
| 拖拽移动 | 仅 Text / FreeText；拖拽结束写回 `/Rect`，注意与文本选择、缩放/旋转的冲突 |
| 跨页移动 | 需要从源页 `/Annots` 移除并在目标页重建，或保持对象引用并更新页归属 |
| Highlight / Ink 位置平移 | 需要同时平移 `QuadPoints` / `InkList`，只改 `/Rect` 不够 |
| 回复串 / 富文本 | 需要注释线程模型，PDF 里对应 `/IRT` / `/RC` 等结构 |
| 表单 JS 动作 | `enableScripting: true` + `eventBus` 补齐，涉及 Keystroke / Format 校验 |
| 保存 / 导出 | 当前改动只在应用内存中重载；需要「下载修改后的 PDF」与可选的重新加密/线性化 |

---

### 8. 下载 / 打印

**现状**：都不能。

**实现要点**：

- **下载**：`loadingTask.getData()` 拿原始字节 → `Blob` + `a[download]`。
  注意加密 PDF 需要密码解锁后才能取到数据。
- **打印**：
  - 简易版：隐藏 iframe 里逐页 `page.render({ annotationMode: ENABLE_STORAGE })` 后 `iframe.print()`。
  - 或者直接用 `window.print()` + `@media print` CSS，只打印当前 DOM（会有滚动/懒加载问题，不推荐）。
  - 必须带 `AnnotationMode.ENABLE_STORAGE`，否则表单填写的内容打不出来。

**验收**：下载得到与源文件一致的文件；打印预览包含所有页且表单值正确；懒加载文档不会漏页。

---

## P3 — 可访问性

### 9. ARIA 补齐

**现状**：虚拟滚动条（`role="scrollbar"` + 完整 `aria-value*`）、所有图标按钮（`aria-label`）、
模态框（`role="dialog"` + `aria-modal`）已具备。以下缺失：

| 位置 | 建议 |
| --- | --- |
| 目录树 `OutlinePanel` | `role="tree"` / `treeitem`、`aria-expanded`、`aria-level` |
| 页码指示 | `aria-live="polite"`，翻页时播报当前页 |
| 阅读区 | `tabindex="0"` + `role="region"` + `aria-label`，让键盘用户能聚焦滚动 |
| 搜索结果计数（将来） | `role="status"` |

**验收**：axe DevTools 扫描无 serious / critical 问题；纯键盘可完成「打开文件 → 翻页 → 看目录 → 看属性」全流程。

---

### 10. qpdf 集成（解密 / 重新加密 / 线性化）

**背景**：当前加密 PDF 可以由 pdf.js 输密码阅读，但注解写回是只读——pdf-lib 无法安全修改含 `/Encrypt` 的文档；用 `ignoreEncryption: true` 会保留加密字典却写入明文对象，生成损坏文件。因此需要真正的解密/加密工具。

**目标**：

1. 用户密码解锁后得到解密字节，交给 pdf-lib 修改注解 / 元数据。
2. 导出时可选择：保持加密、去除加密、按权限重新加密（打印 / 复制 / 修改 / 注释）。
3. 导出时可选择线性化（Fast Web View）。
4. 无密码时保持只读，不影响现有阅读能力。

**方案**：

- 优先使用 qpdf 官方 WASM 构建（Apache-2.0），在 **Web Worker** 中按需加载，避免主线程阻塞。
- 新建 `src/lib/pdfSecurity.ts` 封装：
  - `inspect(bytes)` → 是否加密、权限、线性化状态
  - `decrypt(bytes, password)` → 解密字节
  - `encrypt(bytes, { userPassword, ownerPassword, permissions })` → 加密字节
  - `linearize(bytes)` → 线性化字节
- 阅读路径仍走 pdf.js 原生密码流程；**仅在进入编辑或导出时执行解密**，减少不必要的内存与 CPU 开销。
- 解密后的字节用于 pdf-lib；原始字节保留用于「另存为」，避免误覆盖。
- UI：密码弹窗（已有原生 prompt，后续可换自定义）、导出对话框（加密/权限/线性化选项）。

**风险与注意**：

- wasm 体积数 MB，需要懒加载 + 缓存；首屏不能引入。
- 密码只保存在内存，任务结束即清空；不写入 localStorage / URL。
- 重新加密或线性化会使数字签名失效，导出前明确提示。
- 线性化会改变字节布局，后续增量更新 / 注解索引策略需要重新评估。
- qpdf 的权限控制是「阅读器约定」，不是加密强度保证。

**验收**：

- 打开加密 PDF → 输密码 → 可新增/编辑/删除注解并导出。
- 导出对话框能选择保持加密 / 去除加密 / 线性化。
- 未提供密码时仍可阅读，但注解编辑保持只读提示。
- 导出的加密 PDF 在第三方阅读器中按权限表现正确。

---

## 已决策：缩略图侧栏（暂不实现）

保留 `src/components/ThumbnailSidebar.tsx` 的类型骨架（无实现、无调用）。

**预定方案**（将来要做时）：

- **闸门**：仅 `numPages <= 10` 时启用。真正的痛点是「为几百页各渲一张位图」，而非侧栏本身。
- **不光栅化**：绝不调用 `page.render()`，只做一次 `getTextContent()` + `getOperatorList()` 的信号采集。
- **三态 SVG**：`text`（纯文字页：页面边框 + 若干横条）/ `image`（含图页：占位块 + 少量文字线）/ `blank`（空白页：只有边框）。
- **确定性**：图形长度用 `pageNumber` 作伪随机种子，保证同页每次一致，滚动不闪。
- **可取消 + 缓存**：异步分类带 `AbortSignal`，结果进 `WeakMap<PDFDocumentProxy, ThumbnailItem[]>`。
- **失败降级**：单页分类失败回落到 `FALLBACK_THUMBNAIL_KIND`，侧栏不因一页崩整体。

---

## 验收：特征 PDF 实测清单

| # | 场景 | 验证目标 | 状态 |
| --- | --- | --- | --- |
| 1 | 非嵌入中/日/韩字体 + 预定义 CMap 的 PDF | `cmaps/` 按需生效，文本/渲染正确 | ⬜ 缺真实样本 |
| 2 | 含 JBIG2 / JPEG2000 图像的扫描件 | `wasm/` 按需生效，图像正常 | ⬜ 缺真实样本 |
| 3 | 使用 Helvetica / Times 的未嵌入字体 PDF | `standard_fonts/` 生效，排版正确 | 🟡 已可造（`mock_pdf.mjs -k text`），但未强制走资源路径 |
| 4 | 加密 PDF | 弹密码框、输错提示、解锁后可读 | ⬜ 缺真实样本 |
| 5 | 带链接 / 表单的 PDF | 链接可点、字段可填、值保留 | ✅ 已验证 |
| 6 | 上千页大文档 | 首屏与内存可控、滚动不卡 | ⬜ 只验证过 60 页 |

### 关于第 3 项

pdf-lib 的 `StandardFonts` 生成的是 **base-14 未嵌入字体**（`/BaseFont /Helvetica`、
`/Subtype /Type1`、无 `FontFile*`），所以本仓库脚本产出的每个 PDF 都天然是「未嵌入标准字体」。

但 pdf.js 的 `useSystemFonts` **默认 `true`** —— 本机有 Helvetica 之类替代字体时，
它根本不去 fetch `standard_fonts/`。因此「排版正确」能验，但「资源路径生效」验不到。

要真正验证资源路径，需在 `getDocument` 里显式设 `useSystemFonts: false`
（这会让跨平台渲染更一致，但是否要改是产品决策，暂未改动）。

### 关于第 1 / 2 / 4 项

这三类**不是格式只能解码**，而是 `pdf-lib` 缺少对应编码器：

| 场景 | 可行的生成方式 |
| --- | --- |
| JBIG2 / JPEG2000 | `jbig2enc` / `opj_compress` 先编码，再嵌入；或用 `img2pdf` 原样嵌入 `.jbig2` / `.jp2` |
| CJK 非嵌入 + 预定义 CMap | Ghostscript `-dEmbedAllFonts=false -dSubsetFonts=false`；或 LibreOffice 关闭「嵌入字体」导出 |
| 加密 | `qpdf --encrypt user owner 256 -- in.pdf out.pdf`；或 Python `pypdf` / PyMuPDF |

> 生成脚本：`scripts/mock_pdf.mjs`（`--help` 查用法）。
> 它覆盖场景 3 / 5 / 6 与文本层、目录、空白页等；1 / 2 / 4 需借助上面的工具或外部样本。
> 加密样本目前用 `qpdf --encrypt` 生成；应用内的解密 / 重新加密 / 线性化见第 10 节计划。