# PDF Everything — 测试指南

本文档说明如何测试pdf-everything各项功能。分为「自动化测试」和「手动验证」两部分。

---

## 一、自动化测试

### 运行全部测试

```bash
pnpm test
```

### 测试文件一览

| 文件 | 覆盖内容 |
|------|----------|
| `src/components/__tests__/PdfViewer.test.tsx` | pdfLayout 计算、虚拟滚动条几何/拖动/滚轮/键盘、PdfViewer 高度/布局/Tooltip/主题/属性弹窗/语言切换 |
| `src/components/__tests__/interaction.test.tsx` | interaction 纯函数（clampScale/stepZoom/wheelZoomScale/scrollStepForKey/isEditableTarget）、键盘导航、Ctrl+滚轮缩放 |
| `src/components/__tests__/Slider.test.tsx` | Slider 组件渲染/点击/方向键/禁用 |
| `src/components/__tests__/newFeatures.test.tsx` | 新增 P1/P2 功能（见下） |
| `src/components/__tests__/viewFeatures.test.tsx` | 旋转（90°/270° 宽高互换、按钮联动）、加载进度（百分比 / 流式降级 / 加载遮罩） |
| `src/components/__tests__/oversize.test.tsx` | 双页超大页：`is-oversize` 类、徽标、两页宽上限、`grid-template-columns` |
| `src/components/__tests__/textSelection.test.tsx` | 文本选中：`::selection` 使用半透明 `--selection-bg`（非不透明 `--accent`，防「整片死红」回归）、`--selection-bg` 为 rgba 且 alpha<1、跨多个 span 选中时 `getSelection().toString()` 拼接正确 |
| `src/lib/__tests__/pdfLoading.test.ts` | `pageBatches` 分批切页（每批大小、边界、空区间） |
| `src/lib/__tests__/loadProgress.test.ts` | `formatBytes` / `formatLoadProgress`（字节进位、百分比、流式降级） |
| `src/lib/__tests__/annotation.test.ts` | `createAnnotationStorage`（含 formattedValue 镜像）、`createDestResolver`（数字/对象引用/命名目标）、`createLinkService`（hash/外链属性/跳转） |
| `src/components/annotationEditor/__tests__/annotationTypes.test.ts` | 注解归一化（contents / title / name / rect / index）、过滤与排序、类型 / 图标 i18n key、图标映射、幽灵图标地址、10 个 Text 图标选项 |
| `src/components/annotationEditor/__tests__/pdfAnnotationOps.test.ts` | pdf-lib 注解操作：更新 Contents / T / Name / Rect、删除、居中新增、越界安全、加密异常映射 |
| `src/components/annotationEditor/__tests__/AnnotationItem.test.tsx` | Text 图标选择器（10 个 / active / 回调）、非 Text 不显示、只读禁用、`is-just-changed`、编辑态保存读取本地草稿 |
| `src/components/annotationEditor/__tests__/AnnotationEditor.test.tsx` | 面板空态、列表渲染、跨页跳转、关闭按钮 |
| `src/lib/__tests__/useFocusTrap.test.tsx` | 焦点陷阱：初始焦点、Tab 循环、Escape 关闭、焦点还原 |
| `src/components/__tests__/TimeValue.test.tsx` | 时间值：显示绝对时间 + tooltip 相对时间 |
| `src/lib/__tests__/pdfDate.test.ts` | PDF 日期：`parsePdfDate` / `formatDate` / `formatPdfDate`（合法、非 PDF 格式、越界） |
| `src/lib/__tests__/relativeTime.test.ts` | 相对时间：过去 / 未来 / 此刻、中英文 |
| `src/lib/__tests__/pageSize.test.ts` | 页面尺寸 pt/mm 双单位格式化 + A3/A4/A5/PA5/B4/B5/Letter/Legal 识别（含横向）+ `groupPageSizes` 分组与 10 种上限 |
| `src/lib/__tests__/pdfMeta.test.ts` | 元数据体积：Info + Metadata、无引用、对象流、空 buffer、不误匹配 `N1`；线性化：命中 / 未命中 / 空 buffer |
| `src/lib/__tests__/pdfFonts.test.ts` | `collectFonts`：从 setFont 收集字体、去重、标记嵌入、忽略非 setFont / 未解析 / 非字符串引用 |
| `src/lib/__tests__/propertyExport.test.ts` | INI 序列化（分组 / 空值 / 换行清洗 / 键名随语言）+ 剪贴板复制成功 / 失败 |

### 新增测试（newFeatures.test.tsx）覆盖点

| 测试 | 验证内容 |
|------|----------|
| pageNav helpers | `scrollToPage` / `pageAtScrollTop` / `parsePageInput` 纯函数 |
| PDFPage DPR | canvas 宽高按 `devicePixelRatio` 放大，CSS 尺寸不变 |
| PDFPage 渲染取消 | 切换 scale 时调用 `renderTask.cancel()` |
| PDFPage 文本层调用方式 | 用 `new` 构造 `TextLayer` 并调用实例 `render()`（pdfjs v6 是 class） |
| 重选文件 | 选择后清空 `input.value`，使重复选择同一文件仍触发 `change` |
| 错误分类 | `classifyError` 区分 PasswordException / InvalidPDFException / 未知错误 |
| 页面导航 | 上一页/下一页按钮存在、禁用状态、点击更新当前页 |
| 目录面板 | 有 pdfDoc 时显示目录切换按钮、点击展开 outline-panel |
| 文本层 | 每个渲染页面都创建 TextLayer 容器 |

---

## 二、手动验证（需要真实浏览器 + 特征 PDF）

### 准备工作

1. 构建并启动预览：

```bash
pnpm build && pnpm preview
```

2. 打开 `http://localhost:4173`（或 Vite 输出的地址）。

3. 检查资源目录是否正确部署：

```
dist/pdfjs/cmaps/          ← 精简 73 个 / 完整 168 个 .bcmap
dist/pdfjs/standard_fonts/ ← Foxit + Liberation 字体（两套都 16）
dist/pdfjs/wasm/           ← 精简 3 个 wasm / 完整 15 个文件
dist/pdfjs/iccs/           ← ICC 配置文件
dist/pdfjs/images/         ← 注解图标 annotation-*.svg
```

如果这些目录不存在，说明 `vite-plugin-static-copy` 未生效。

**两套构建的验证差异**：

| 检查 | `pnpm build`（精简） | `pnpm build-full` |
| --- | --- | --- |
| `wasm/quickjs-eval.wasm` | 应 404（SPA 兜底 463 字节） | 200 · 约 458 KB |
| `wasm/jbig2_nowasm_fallback.js` | 应 404 | 200 · 约 129 KB |
| `cmaps/UniJIS-UCS2-V.bcmap`（竖排） | 应 404 | 200 |
| `cmaps/UniGB-UCS2-H.bcmap` | 200 · 约 43 KB | 200 |
| 竖排 PDF | 打不开（提示加载失败） | 正常 |

> 判断是否为 SPA 兜底页：响应体只有约 463 字节且 `content-type: text/html` 即为兜底，
> 说明资源被剔除了（这是精简构建的预期行为，不是错误）。

---

### 用 browse MCP 半自动验证（特定文件）

需要**真实浏览器 + 特定本地文件**（尤其是大文件）时，固定走这套流程：

1. **AI 准备环境**：启动 dev server（`pnpm dev`），用 browse MCP 打开 `http://localhost:<port>/`，确认页面加载。
2. **开发人员手动加载文件**：把目标文件**拖到阅读区**（或点「选择 PDF」）。
3. **AI 继续自动验证**：文件加载后，AI 用 browse 读取 DOM 几何 / 计算样式来核对布局、对齐、懒加载、加载进度等。

> **为什么手动拖**：browse 通过上传注入文件有 **50 MB 上限**，且文件必须在 browse 允许的根目录（临时目录）内。
> 真实大文件 / 任意路径的文件请手动拖入，**不要尝试让 AI 上传**。
>
> **经验**：判断「居中 / 对齐」是否正确，用 `getBoundingClientRect()` 测各元素 `left/right/width` 并算间距，
> 比截图更可靠（顺带照顾到了一些看不了图片的小模型）。

---

### P0 — 资源基址验证

| 场景 | 所需 PDF | 预期结果 |
|------|----------|----------|
| CJK 预定义 CMap | 非嵌入中文字体的中文 PDF | 中文正确渲染，不乱码/空白 |
| JBIG2 图像 | 含 JBIG2 压缩图像的扫描件 | 图像正常显示 |
| JPEG2000 图像 | 含 JPEG2000 (JPX) 图像的 PDF | 图像正常显示 |
| 未嵌入标准字体 | 使用 Helvetica/Times 的 PDF | 排版正确，无字形错乱 |
| ICC 颜色管理 | CMYK / ICC 色彩 PDF | 颜色正确 |

**验证方法**：打开 DevTools → Network 面板，筛选 `cmaps` / `wasm` / `standard_fonts` / `iccs`，确认对应文件被按需 fetch（不是全部下载）。

---

### P1 — 渲染稳定性验证

#### 渲染取消

| 场景 | 预期结果 |
|------|----------|
| 快速连续缩放（+ 按钮或 Ctrl+滚轮） | 不出现 `Cannot use the same canvas during multiple render() operations` |
| 缩放后立即切换双页/单页 | 无报错 |
| 加载后立即关闭页面 | 无内存泄漏告警 |

#### DPR 高分屏

| 场景 | 预期结果 |
|------|----------|
| 在 DPR=2 的显示器上打开 PDF | 文字/图像清晰，无模糊 |
| DevTools 中检查 canvas 的 width/height | 物理像素 = CSS 像素 × 2 |

#### 文档销毁

| 场景 | 预期结果 |
|------|----------|
| 换文件后立即查看内存 | 旧 worker 被销毁，无累积 |
| DevTools → Memory → Take snapshot 对比 | 换文件前后无 worker 泄漏 |

#### 错误分类

| 场景 | 预期结果 |
|------|----------|
| 拖入非 PDF 文件 | 显示「文件不是有效的 PDF」 |
| 打开加密 PDF | 弹出密码输入框，输入密码后可解锁 |
| 输入错误密码 | 提示「密码错误，请重试」 |
| 打开损坏的 PDF | 显示「加载 PDF 失败」 |

---

### P2 — 功能验证

#### 文本层

| 场景 | 预期结果 |
|------|----------|
| 打开含文字的 PDF | 可以用鼠标选中文本 |
| Ctrl+C 复制 | 剪贴板内容正确 |
| 选中文本 | 高亮显示（半透明蓝色），文字仍清晰可见；不能是整片不透明色块 |

> 选中的高亮色由 `src/app.css` 的 `--selection-bg`（`rgba(59, 130, 246, 0.35)`）决定，
> `::selection` 只画背景、`color: transparent`（字形来自 canvas），所以半透明高亮下文字仍可读。
> 自动化回归见 `textSelection.test.tsx`；真实浏览器逐像素验证：选中区主色为 `rgb(187,211,252)`
> （= 0.35×蓝 + 0.65×白），区外为纯白 `rgb(255,255,255)`。

#### 页码导航

| 场景 | 预期结果 |
|------|----------|
| 工具栏右侧 | 显示「‹ 1 / N ›」 |
| 点击「下一页」 | 滚动到下一页顶部，页码更新 |
| 点击「上一页」 | 滚动到上一页顶部 |
| 第 1 页时 | 「上一页」按钮禁用 |
| 最后一页时 | 「下一页」按钮禁用 |
| 滚动后 | 页码指示器自动更新 |

#### 旋转

| 场景 | 预期结果 |
|------|----------|
| 点击左转 / 右转 | 页面内容旋转 90°，文本层 / 表单 / 链接仍对齐（共用旋转后 viewport） |
| 旋转 90°/270° | canvas 宽高互换，`.pdf-page-wrapper` 宽度与占位块比例随之翻转 |
| **旋转后当前页不漂移** | 在第 N 页（滚动到该页顶部附近）点击旋转，旋转后仍定位回第 N 页顶部（`scrollTop ≈ 第N页.offsetTop`），页码指示不变 |
| ≤ 2 页文档 | 旋转不触发重定位（豁免，避免无谓滚动） |
| 换文件 | 旋转角度重置为 0° |

> 重定位实现：`useLayoutEffect([rotation])` → `goToPage(currentPage)`，绘制前完成、无闪烁。
> 测量：旋转前后取当前页 wrapper 的 `offsetTop` 与容器 `scrollTop`，断言二者相等（drift ≈ 0）。

#### 双页居中与超大页（混合页面尺寸）

| 场景 | 预期结果 |
|------|----------|
| 打开含**超大页**（比多数页宽 > 10%）的 PDF，切到双页 | 普通页两页并排、间距 16px、整体水平居中 |
| 超大页（如 879×1191，多数页 652×850） | **独占一行**、水平居中、左上角有强调色徽标、带强调色描边；不被Paired with 普通页 |
| 超大页宽度上限 | 最多占「两页宽」（`2*多数页宽 + 间距`），超出则等比缩小，不会把整体撑宽 |
| 双页 100% 缩放下的边距 | 普通行左右边距基本相等；`container.scrollWidth === clientWidth`（无横向溢出） |
| 单页模式 | 每页在**阅读区内**水平居中（右侧 minimap 会让阅读区整体偏左，属预期） |

> **回归背景**：曾用 `grid-template-columns: repeat(2, max-content)`，列宽会被**最宽的一页**撑大，
> 导致所有普通页在超宽列里左对齐、居中失效。现改为「列宽固定为多数页宽（众数）+ 超大页 `grid-column: 1 / -1` 跨两列独占一行」，
> 普通页不受超大页影响。判定基准与阈值见 `lib/pdfLayout.ts`（`computeReferenceWidth` / `isOversizePage` / `oversizeMaxWidth`）。
>
> **已知取舍**：超大页跨两列会让它**前一张**普通页暂时落单（右侧留空），这是 CSS Grid 自动排布的必然结果；
> 未启用 `grid-auto-flow: dense`，因为 dense 会打乱阅读顺序（把后面的页回填到前面的空位）。
>
> **测量方法**（browse 控制台 / evaluate）：取相邻两 `.pdf-page-wrapper` 的 `getBoundingClientRect()`，
> 断言 `wrap0.right + 16 ≈ wrap1.left` 且左右边距相等；超大页断言 `.is-oversize` 类存在、`.oversize-badge` 存在、
> 其 `top` 与前后页不同（独占一行）、`left/right` 边距相等（居中）。

#### 目录（Outline）

| 场景 | 预期结果 |
|------|----------|
| 打开有目录的 PDF | 工具栏出现目录按钮（三横线图标） |
| 点击目录按钮 | 左侧展开目录面板 |
| 点击目录项 | 跳转到对应页面 |
| 点击折叠三角 | 展开/折叠子目录 |
| 无目录 PDF | 显示「此 PDF 无目录」 |

#### Worker 复用

| 场景 | 预期结果 |
|------|----------|
| 连续切换多个 PDF | DevTools → Application → Workers，仅一个 worker 实例 |

#### 分批获取页面

`PdfViewer` 不再一次性 `getPage(1..N)`，而是先取第 1 页（定尺寸、出首屏），
其余页按 `PAGE_BATCH_SIZE = 24` 分批拉取，未到达的页用同比例占位块撑住布局。

| 场景 | 预期结果 |
|------|----------|
| 打开 60 页文档 | 首屏很快出现；滚动高度从一开始就接近最终值，滚动条不跳变 |
| 加载过程中 | 未加载页显示灰色占位块（`.page-placeholder`），加载完消失 |
| 加载完成后 | 占位块数量为 0，`.pdf-page-wrapper` 数量 = 总页数 |
| 页码指示器 | 显示总页数（`numPages`），不受分批进度影响 |

> 注：本地小文件分批在 ~160ms 内就跑完了，肉眼看不到中间态属正常。
> 想稳定观察可临时把 `PAGE_BATCH_SIZE` 改小（如 4）。

#### 注解层（AnnotationLayer）

`canvas` 之上叠加注解层：**链接可点、表单可填**。
需要 `page.render({ annotationMode: ENABLE_FORMS })` 配合，避免表单被画两遍。

| 场景 | 预期结果 |
|------|----------|
| 打开含外链的 PDF | 链接区域出现 `<a>`，`href` 为原 URL，点击可跳转（`target=_blank`） |
| 打开含内部跳转的 PDF | 点击后跳到目标页，页码指示器同步 |
| 含文本输入框的 PDF | 出现 `<input type=text>`，可输入；**缩放 / 翻页后内容保留** |
| 含复选框的 PDF | 出现 `<input type=checkbox>`，可勾选；缩放后状态保留 |
| 表单值与 canvas 对齐 | 输入框位置随缩放同比例移动，不偏移 |

**测试 PDF 生成**：

```bash
# 混合页（外链 + 内部跳转 + 文本域 / 多行文本 / 复选框 / 下拉 + 图片）
node scripts/mock_pdf.mjs -k mixed -p 3 -o C:/Users/<you>/AppData/Local/Temp/kilo/mixed.pdf

# 单独验证表单
node scripts/mock_pdf.mjs -k forms -p 2 -o C:/Users/<you>/AppData/Local/Temp/kilo/forms.pdf

# 查看全部种类
node scripts/mock_pdf.mjs --list
```

| kind | 用途 |
| --- | --- |
| `text` | 纯文字页（文本层 / 搜索 / 复制） |
| `image` | 内嵌 PNG 位图（图像渲染） |
| `blank` | 空白页（空白页处理） |
| `links` | 外链 + 内部页跳转（注解层链接） |
| `forms` | 文本框 / 多行文本 / 复选框 / 下拉（表单可填） |
| `outline` | 含 `/Outlines` 书签树（目录面板） |
| `mixed` | 以上按页组合 |
| `pages` | 指定页数纯文字（分批加载 / 懒加载） |

> 覆盖范围：`text` / `image` / `blank` / `links` / `forms` / `outline` / `mixed` / `pages` 全部可造。
> 其中「未嵌入标准字体」场景天然覆盖（pdf-lib 的 StandardFonts 就是 base-14 不嵌入）。
>
> **造不出来的（pdf-lib 编码器缺口，不是格式只能解码）**：
> - JBIG2 / JPEG2000 → 需 `jbig2enc` / `opj_compress` 先编码，或 `img2pdf` 原样嵌入
> - CJK 非嵌入 + 预定义 CMap → 需 Ghostscript `-dEmbedAllFonts=false` / LibreOffice 关闭字体嵌入
> - 加密 PDF → pdf-lib 不支持，用 `qpdf --encrypt` / `pypdf` / PyMuPDF
> - 真实大文档 → 页数能造，但没有真实大文档的体积与结构特征
>
> **另注意**：pdf.js 的 `useSystemFonts` 默认 `true`，本机有 Helvetica 时可能根本不 fetch
> `standard_fonts/`。要强制验证该资源路径，需在应用侧设 `useSystemFonts: false`。

#### 注解编辑（AnnotationEditor）

入口：工具栏「注解」按钮（`annotation-comment.svg`）。面板默认「当前页」，可切「全部」。

| 场景 | 预期结果 |
|------|----------|
| 查看 / 定位 | 列表显示图标、内容、作者、页码；点条目跳到对应页，页面上的注解短暂出现强调色描边 |
| 展开详情 | 显示完整内容、作者、创建/修改时间；内容长时换行不溢出 |
| 新增（放置模式） | 点「新增注解」→ 十字光标 + 面板提示；鼠标在页面上时出现跟随图标，移到面板/页面外隐藏，靠边时被夹在页面视口内；点击页面后出现脉冲落点标记与内容/作者表单 |
| 新增保存 | 列表数量 +1；新条自动展开、滚到可见区并闪烁；落点标记与幽灵图标消失；页面注解层出现新图标 |
| Esc / 取消 | 幽灵图标、落点标记、放置提示全部消失，不新增 |
| 编辑内容 / 作者 | 保存后内容更新；条目保持展开并闪烁；侧面板不重置、不丢失当前项 |
| 更换图标 | Text 注解详情显示 10 个图标；切换后列表图标与页面图标同步（例如 `annotation-note.svg` → `annotation-key.svg`），当前图标高亮 |
| 重新定位 | Text / FreeText 详情出现「重新定位」；点当前页新位置后注解移动（`/Rect` 更新），尺寸保持不变 |
| 删除 | 确认后条目消失，页面上的注解同步消失 |
| 多页 / 全部页 | 「全部页」模式点其它页注解会跳页；新增时点哪一页就落在哪一页 |
| 加密 PDF | 顶部黄色提示「该 PDF 已加密，暂不支持修改注解」；新增/编辑/删除/图标选择均禁用；**不出现** pdf-lib 的英文 encrypted 异常 |
| 重载稳定性 | 任何增删改后，面板仍保持打开与当前范围，刚改项自动展开并闪烁，能立刻确认改的是哪一条 |

**踩坑经验（注解编辑）**：

1. **Text 注解图标字段是 `/Name`，不是 `/Icon`**。pdf.js 的渲染路径是
   `annotation-${data.name.toLowerCase()}.svg`，所以换图标必须写 `/Name`。
2. **pdf-lib 遇到 `/Encrypt` 会直接抛错**。不要用 `ignoreEncryption: true` 强行写回：
   会保留加密字典却写入明文对象，生成的 PDF 会损坏。当前策略是映射为 `ENCRYPTED_PDF` 并禁用编辑。
3. **注解索引必须按每页 `/Annots` 下标**，不能用跨页累计长度；否则多页文档会改错注解。
4. `annots.get(i)` 可能返回 `PDFRef`，也可能是内联字典。统一 `doc.context.lookup()` 后判断 `PDFDict`。
5. **自动化测试的时序**：输入后立刻点保存时，如果保存按钮读的是父组件 props，可能拿到旧值。
   组件已改为本地草稿 state；测试仍建议 `fill()` 后再单独点击保存，模拟真实用户事件。
6. **编辑后整份 PDF 重载会重置面板**。用 `documentKey` 区分「打开新文件」与「编辑重载」；
   `pendingFocus + scrollIntoView + is-just-changed` 让刚改项自动展开并闪烁。
7. **坐标换算不要用全局 scale**：oversize 页的渲染 scale 不同。应按被点击页面 DOM 的实际渲染宽度反推 scale，并读页面上的 `data-rotation`。
8. **幽灵图标限制在页面内**：用 `position: fixed` 跟随鼠标，位置夹紧到 host 的 `getBoundingClientRect()`；鼠标在面板或页面外时隐藏。
9. **测试 PDF 里的字符串必须用 `PDFString.of(...)`**。直接写 JS 字符串会被 pdf-lib 编码成 PDFName，pdf.js 读不到 `/Contents`。
10. **`window.confirm` 会暂停浏览器的自动化页面**。browse MCP 需要显式 `dialog accept`；覆盖 `window.confirm` 不一定生效。

#### 属性面板

| 场景 | 预期结果 |
|------|----------|
| 点击工具栏属性按钮 | 打开属性弹窗，显示文件名 / 版本号 / 作者 / 主题 / 创建工具 / 生成工具 / 创建 / 修改时间 / 页面尺寸 / 页数 / 平均每页占用 / 线性化 |
| 版本号 | 显示 PDF 详细版本（如 `1.7`，来自 `PDFFormatVersion`） |
| 修改时间缺失（含创建 / 修改都缺失）或与创建时间相同 | 不显示「修改时间」行（渲染与 INI 都不含） |
| hover 时间值 | 显示相对时间（如「3 天前」），每 30s 自动刷新 |
| 页面尺寸（标准） | 显示如 `595 × 842 pt (A4)`；识别 A3/A4/A5/PA5/B4/B5/Letter/Legal（含横向） |
| 页面尺寸（非标准） | 双单位显示，如 `800 × 1000 pt（约 282 × 353 mm）` |
| 点击「计算所有页」 | 全部一致 → 标签变「所有页尺寸」；不一致 → 弹出明细窗口（最多 10 种，pt+mm，每种一个代表页） |
| 字体 | 行内最多显示 3 个（逗号分隔）；超过 3 个出现「更多字体」按钮 |
| 点击「更多字体」 | 弹出字体列表（最多 50 种，标题显示数量）；嵌入字体带「嵌入」标签 |
| 线性化 / Fast Web View | 线性化 PDF 显示「是」，普通 PDF 显示「否」；键名 hover 显示说明 tooltip |
| 平均每页占用 | 打开时该行先显示骨架，随后显示如 `482 KB`；其他属性行不受影响；键名 hover 显示计算口径 tooltip |
| 点击「复制」 | 剪贴板为 INI 文本，键名随当前语言；按钮短暂显示「已复制」 |
| 复制失败（剪贴板被禁用等） | 按钮显示「复制失败」（错误色），约 2s 后恢复 |
| 窗口尺寸 | 平板竖屏 / 横屏、4K 大屏下弹窗完整可见；内容多时主体内部滚动，头尾固定 |

> 元数据体积走 Web Worker（`pdfMeta.worker.ts`），打开窗口时才计算；超大文件（>128MB）
> 跳过精确解析、按 `文件大小 / 页数` 估算。可临时把 `MAX_PRECISE_METADATA_BYTES` 调小来观察骨架态。

#### 焦点管理（模态框）

| 场景 | 预期结果 |
|------|----------|
| 点击属性按钮 | 焦点落在模态框内第一个可聚焦元素（关闭按钮） |
| 连续按 Tab | 焦点只在弹窗内按钮（计算所有页 / 复制 / 关闭）之间循环，不会跑到背景页 |
| Shift+Tab | 反向循环，同样不出模态框 |
| 按 Escape | 模态框关闭，焦点回到「PDF 属性」按钮 |
| 点击遮罩空白处 | 模态框关闭，焦点同样回到「PDF 属性」按钮 |

---

## 三、验收清单

- [ ] `pnpm test` 全部通过（204 个测试）
- [ ] `pnpm lint`（oxfmt + tsc）通过
- [ ] `pnpm build` 成功，`dist/pdfjs/{cmaps,standard_fonts,wasm,iccs,images}/` 存在
- [ ] 资源基址以 `/` 结尾、同源（DevTools Network 确认按需 fetch）
- [ ] 高分屏下 PDF 渲染清晰
- [ ] 快速缩放不报错
- [ ] 加密 PDF 弹出密码框
- [ ] 非 PDF 文件提示错误
- [ ] 文本可选中复制
- [ ] 页码导航正常
- [ ] 目录面板正常
- [ ] 链接可点、表单可填且值在缩放后保留
- [ ] 注解面板：新增（放置模式）/ 编辑 / 删除 / 重新定位 / Text 图标切换正常
- [ ] 注解改动重载后，侧面板保持选中与展开，刚改项有闪烁定位
- [ ] 加密 PDF 的注解编辑显示只读提示，而不是 pdf-lib 英文异常
- [ ] 中英文 i18n 正常
- [ ] 双页居中正确（混合页面尺寸下普通页 2-up 居中、超宽页不破坏居中）
- [ ] 属性面板：元数据、日期 / 相对时间、页面尺寸、平均每页占用、线性化检测、INI 复制正常

---

## 四、快速测试命令

```bash
# 运行全部测试
pnpm test

# 运行测试并监听变化
pnpm test:watch

# 类型检查 + lint
pnpm lint

# 构建并检查资源目录
pnpm build && ls dist/pdfjs/

# 启动开发服务器（手动测试用）
pnpm dev
```