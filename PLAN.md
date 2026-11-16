# PDF Everything — 资源完整性与功能补齐计划

> 本文只聚焦两件事：
> 1. pdfjs-dist 的**配套资源缺失**导致的功能残缺问题（必须修）。
> 2. 一个"完整 PDF 查看器"还应该补充的功能（建议按优先级推进）。
>
> 体积问题已搁置，不在本文范围。

---

## 0. 结论先行（TL;DR）

- 现状：`PdfViewer.tsx:64` 的 `getDocument({ data: arrayBuffer })` **只传了 `data`，没有传任何资源基址**（`cMapUrl` / `standardFontDataUrl` / `wasmUrl` / `iccUrl` 全为 `null`）。
- 后果：当某个 PDF **真正用到** cmaps / standard_fonts / wasm / iccs 中的某个文件时，pdf.js 会因为"不知道去哪取"而**抛错或降级渲染**。
- 关键澄清：这些资源**本身就是按需加载的**——pdf.js 只在当前 PDF 真正需要某类资源时，才去 fetch 对应的**单个文件**。所以"补基址"**不等于**"把几百个文件提前下载"，只是告诉 pdf.js 去哪找。这正好满足"大部分 PDF 用不上、要按需加载"的诉求。
- 修复目标：**提供 4 个资源基址 + 把对应目录部署到站点**，其余全部交给 pdf.js 懒加载。

---

## 1. 问题定位（证据）

| 事实 | 证据 |
| --- | --- |
| worker 用 `new URL(...import.meta.url)` 正确引入 | `src/components/PdfViewer.tsx:25-28` |
| `getDocument` 只传 `data`，未传任何资源基址 | `src/components/PdfViewer.tsx:64` |
| 缺基址时 `getFactoryUrlProp` 返回 `null` | `pdfjs-dist/build/pdf.mjs:16213-16217` |
| 基址为 `null` 时，真正需要该资源会抛 `Ensure that the \`X\` API parameter is provided.` | `pdfjs-dist/build/pdf.mjs:7920-7923` |
| 基址必须以 `/` 结尾，否则抛 `Invalid factory url` | `pdfjs-dist/build/pdf.mjs:7176-7184` |
| 同源且三者齐全时走 worker 内 fetch（`useWorkerFetch`，更高效） | `pdfjs-dist/build/pdf.mjs:16243` |
| `useWasm` 默认 `true`（即默认就尝试用 wasm 解码 JBIG2/JPX） | `pdfjs-dist/build/pdf.mjs:16239` |
| 实测 `dist/` 只有 `worker / index.js / index.css`，**没有** `wasm/ cmaps/ standard_fonts/ iccs/` | `dist/assets/` 实际内容 |

> 结论：worker 本身没问题；**缺的是 worker 运行时按需拉取的配套资源基址**。Vite 不会静态打包这些"运行时拼接 URL"的资源，必须显式提供基址 + 部署目录。

---

## 2. 资源清单：每个资源的作用与缺失后果

> 位置：`node_modules/pdfjs-dist/` 下。**以下全部是按需加载**，不会在打开普通 PDF 时下载。

### 2.1 `wasm/` — WebAssembly 解码器（图像/色彩/JS 求值）

| 文件 | 作用 | 触发的 PDF 特征 | 缺失后果 |
| --- | --- | --- | --- |
| `jbig2.wasm` | JBIG2 图像解码（二值图像，扫描件常见） | 含 JBIG2 压缩图像的 PDF | 该类图像无法解码 → 页面空白/报错 |
| `openjpeg.wasm` | JPEG2000（JPX）解码 | 含 JPEG2000 图像的 PDF | 该类图像无法解码 → 页面空白/报错 |
| `qcms_bg.wasm` | 颜色管理（CMYK/ICC 转换） | 依赖 ICC 色彩管理的 PDF | 颜色可能偏差或转换失败 |
| `quickjs-eval.wasm` | 内嵌 JS 求值（少见特性） | 含相应 JS 的 PDF | 相关特性失效 |
| `*_nowasm_fallback.js` | 无 wasm 时的纯 JS 回退 | 运行环境不支持 wasm | 无 wasm 时回退（有则更强） |

- 是否按需：**是**。只有遇到对应图像/特性才 fetch 对应 `.wasm`。
- 量级：约 `jbig2 103KB / openjpeg 220KB / qcms 96KB / quickjs 469KB` + 回退 JS。

### 2.2 `cmaps/` — 预定义 CMap（中日韩字符映射，169 个 `.bcmap`）

| 文件 | 作用 | 触发的 PDF 特征 | 缺失后果 |
| --- | --- | --- | --- |
| `Adobe-GB1-*` / `UniGB-*` / `GBK-*` 等 | 简体中文 CMap | 使用**非嵌入**中文字体 + 预定义 CMap 的中文 PDF | 中文**无法正确映射/提取**，出现乱码或空白 |
| `Adobe-Japan1-*` / `UniJIS-*` / `RKSJ-*` | 日文 CMap | 日文 PDF | 日文乱码/空白 |
| `Adobe-Korea1-*` / `UniKS-*` | 韩文 CMap | 韩文 PDF | 韩文乱码/空白 |
| `Adobe-CNS1-*` / `UniCNS-*` / `B5*` | 繁体中文 CMap | 繁体 PDF | 繁体乱码/空白 |

- 是否按需：**是**。仅当 PDF 引用某个预定义 CMap 时，才 fetch 对应**一个** `.bcmap`（不是整目录）。
- 量级：单文件通常几 KB~几十 KB；整目录共 169 个。

### 2.3 `standard_fonts/` — 14 标准字体的替代字体（Foxit + Liberation）

| 文件 | 作用 | 触发的 PDF 特征 | 缺失后果 |
| --- | --- | --- | --- |
| `Foxit*.pfb` | 14 标准字体（Helvetica/Times/Courier/Symbol/Dingbats 等）的替代 | 使用**未嵌入**标准字体的 PDF | 字形/字宽不准，**排版错乱**；浏览器会先试系统字体（`useSystemFonts` 默认 `true`），系统没有时降级，效果不可控 |
| `LiberationSans-*.ttf` | 无衬线替代 | 同上 | 同上 |

- 是否按需：**是**。仅当用到未嵌入标准字体时 fetch。
- 量级：单文件几十 KB~上百 KB。

### 2.4 `iccs/` — ICC 颜色配置文件

| 文件 | 作用 | 触发的 PDF 特征 | 缺失后果 |
| --- | --- | --- | --- |
| `CGATS001Compat-v2-micro.icc` | 色彩管理基础 profile | 依赖 ICC/CMYK 转换的 PDF | 颜色管理降级，颜色可能偏差 |

- 是否按需：**是**。
- 量级：极小（单文件）。

### 2.5 `image_decoders/` — 独立的图片解码 worker 构建（可选）

| 文件 | 作用 | 缺失后果 |
| --- | --- | --- |
| `pdf.image_decoders.min.mjs` | 把图片解码放到独立 worker 的可选构建 | **不影响当前正确性**；属性能/大图优化项，可暂不部署 |

---

## 3. 修复方案（只给方案，不在本文实施）

### 方案 A（推荐）：构建期从 `node_modules` 拷贝到产物

用 `vite-plugin-static-copy` 在 `vite build` 时把 4 个目录拷进 `dist/`，避免手工维护、并跟随 `pdfjs-dist` 版本：

```
dist/pdfjs/cmaps/...
dist/pdfjs/standard_fonts/...
dist/pdfjs/wasm/...
dist/pdfjs/iccs/...
```

优点：不污染仓库、与依赖版本同步。

### 方案 B（无新依赖）：放进 `public/`

把 4 个目录放到 `public/pdfjs/`，Vite 会原样复制到 `dist/pdfjs/`。缺点是需要在仓库里维护这些文件（或写个同步脚本）。

### 方案 C：构建后脚本拷贝

在 `build` 脚本里追加一步 `cp`/`node` 脚本，从 `node_modules/pdfjs-dist` 拷贝到 `dist/pdfjs/`。

### 基址写法（三种方案通用）

关键约束：**必须以 `/` 结尾**、且为**同源绝对 URL**（否则 `useWorkerFetch` 与 `isValidFetchUrl` 不生效）。在 `getDocument` 处补：

```ts
const base = import.meta.env.BASE_URL // 默认 "/"，部署在子路径时需相应配置
pdfjsLib.getDocument({
  data: arrayBuffer,
  cMapPacked: true,
  cMapUrl: `${base}pdfjs/cmaps/`,
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  wasmUrl: `${base}pdfjs/wasm/`,
  iccUrl: `${base}pdfjs/iccs/`,
  useWasm: true,
})
```

> 说明：只补"基址"，具体文件仍由 pdf.js 按需 fetch——这正是"大部分 PDF 不下载这些资源"的实现方式。

### 部署检查清单

- [ ] `dist/pdfjs/{cmaps,standard_fonts,wasm,iccs}/` 存在。
- [ ] 基址以 `/` 结尾、同源（`isValidFetchUrl` 通过）。
- [ ] 子路径部署时 `BASE_URL` 正确。
- [ ] 准备 4 类特征 PDF 做验证（见 §5）。

---

## 4. 功能完整性待补（建议按优先级推进）

> 现状可用能力：上传（拖拽/选择）、全量 `getPage`、canvas 渲染、虚拟滚动条、缩放（按钮/输入框/Ctrl+滚轮）、键盘导航、主题、属性弹窗、i18n、≥10 页懒加载。

### A. 渲染正确性与稳定性（P1，实质是 bug）

- **渲染任务未取消**：`PDFPage.tsx:34` 直接 `page.render().promise`，缩放切换/换文件/卸载时未 `cancel()`，易触发 `Cannot use the same canvas during multiple render() operations` 与资源泄漏。应保存 `RenderTask`，`useEffect` 清理时 `task.cancel()`。
- **未适配 `devicePixelRatio`**：`PDFPage.tsx:24-27` 用 CSS 像素尺寸作为 canvas 宽高，高分屏（DPR>1）下**模糊**。应按 DPR 放大 backing store 并用 `transform` 缩放。
- **未销毁文档/worker**：`PdfViewer.tsx` 换文件或卸载时未 `pdfDoc.destroy()` / `loadingTask.destroy()`，worker 与内存泄漏。
- **错误分类太笼统**：`PdfViewer.tsx:75` 统一 `failedToLoad`。应对 `PasswordException`（加密，需密码）、`InvalidPDFException`（非 PDF/损坏）分别处理；并校验 `%PDF` 文件头。
- **加密 PDF 无密码入口**：`getDocument` 未处理 `onPassword`，加密 PDF 直接失败。

### B. 文本与搜索（P2）

- **无文本层**：未渲染 `TextLayer`，用户**无法选中/复制**文字。pdfjs 主包已导出 `TextLayer`（`types/src/pdf.d.ts`）。
- **无搜索**：无 `Ctrl+F` 全文搜索与高亮/跳转（依赖文本层）。

### C. 导航（P2）

- **无页码跳转 / 上一页 / 下一页**：只能靠滚动。
- **无目录（outline）**：未用 `pdfDoc.getOutline()`。
- **无缩略图侧栏**：无 `getPage` 缩略图导航。
- **无页面标签**：未用 `getPageLabels()`（罗马数字/前缀页码）。

### D. 显示模式（P3）

- **无旋转**：缺 90° 顺/逆时针旋转。
- **无适配模式**：缺"适合宽度 / 适合页面 / 实际大小"，只有数值缩放。
- **无阅读模式**：缺单页/双页/连续滚动切换。

### E. 标注与表单（P3）

- **无 `AnnotationLayer`**：默认 `annotationMode = ENABLE`（`pdf.mjs:16655`）只画外观，**链接不可点、表单不可填**。需叠加 `AnnotationLayer`（主包已导出）才能交互。
- **无注释/高亮交互**：无标注查看/编辑。

### F. 文件与导出（P3）

- **无下载 / 打印**：不能保存或打印当前文件。
- **无加载进度**：未用 `loadingTask.onProgress` 显示百分比。

### G. 性能与体验（P2/P3）

- **未复用 `PDFWorker`**：每次换文件重建 worker；应复用单个 `PDFWorker`（`PDFWorker.fromPort`）减少抖动。
- **`getDocument` 选项未调优**：可加 `maxImageSize`、`disableAutoFetch`、`enableHWA`、`canvasMaxAreaInBytes` 等。
- **一次性 `getPage` 全部页**：`PdfViewer.tsx:68-73` 对上千页大文档会一次性拉全部页代理，内存与首屏压力大；建议按需/分批获取。
- **移动端手势**：无双指缩放/触摸滚动优化。

### H. 可访问性（P3）

- **模态框焦点管理**：`PropBtn.tsx:102` 用 `tabIndex={-1}` 但无焦点陷阱、关闭后不还原焦点，键盘体验差。
- 其余键盘可达性、ARIA 可进一步补齐。

---

## 5. 优先级与验收

| 优先级 | 事项 |
| --- | --- |
| **P0** | 补 4 个资源基址 + 部署目录（否则功能残缺） |
| **P1** | 渲染取消 / DPR / destroy / 错误分类 / 加密密码 / `%PDF` 校验 |
| **P2** | 文本层 + 搜索 + 页码跳转 + 目录 + 缩略图 + 复用 worker |
| **P3** | 旋转 / 适配 / 阅读模式 / 标注表单 / 下载打印 / 焦点管理 |

### 验收：准备"特征 PDF"逐类验证

1. **CJK 预定义 CMap**：非嵌入中/日/韩文字体 PDF → 文本/渲染正确（验证 `cmaps/`）。
2. **JBIG2 / JPEG2000 图像**：扫描件 → 图像正常显示（验证 `wasm/`）。
3. **未嵌入标准字体**：用 Helvetica/Times 的 PDF → 排版正确（验证 `standard_fonts/`）。
4. **加密 PDF**：需密码 → 弹密码框可解锁（验证 P1 错误分类）。
5. **带链接/表单 PDF**：链接可点、字段可填（验证 P3 标注层）。
6. **大文档（上千页）**：首屏与内存可控（验证 P2 分批加载）。