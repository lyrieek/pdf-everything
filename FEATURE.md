# PDF Everything — 功能详解

本文档详细描述**已实现**的功能、行为细节与关键参数。
尚未实现的项见 [PLAN.md](./PLAN.md)；测试方法见 [TEST.md](./TEST.md)；项目概览见 [README.md](./README.md)。

---

## 目录

1. [文件打开](#1-文件打开)
2. [文档加载与资源](#2-文档加载与资源)
3. [页面加载策略](#3-页面加载策略)
4. [页面渲染](#4-页面渲染)
5. [文本层](#5-文本层)
6. [注解层（链接 / 表单）](#6-注解层链接--表单)
7. [导航](#7-导航)
8. [缩放](#8-缩放)
9. [界面与外观](#9-界面与外观)
10. [可访问性](#10-可访问性)
11. [关键参数速查](#11-关键参数速查)
12. [目录结构](#12-目录结构)

---

## 1. 文件打开

### 1.1 两种入口

| 入口 | 实现 |
| --- | --- |
| 拖拽 | 阅读区监听 `dragover` / `drop`，`preventDefault` 后取 `dataTransfer.files[0]` |
| 选择文件 | 工具栏「选择 PDF」`label` 绑定隐藏的 `<input type="file" accept="application/pdf">` |

拖拽时只在 `file.type === 'application/pdf'` 时加载，否则提示「请拖拽 PDF 文件」。

### 1.2 文件头校验

除 MIME 之外，还会读取文件**前 5 字节**并校验是否以 `%PDF` 开头（`isPdfFile`）。
这样「改了扩展名的非 PDF」也会被拦下。

容错策略：读取失败或不足 5 字节时**放行**，交给 pdf.js 判断——避免在测试环境 / 受限文件系统上误杀。

### 1.3 错误分类

`classifyError` 把异常映射成三类用户可见提示（i18n key）：

| 异常 | 提示 key | 中文文案 |
| --- | --- | --- |
| `PasswordException` / message 含 `password` | `error.passwordRequired` | 此 PDF 已加密，请输入密码 |
| `InvalidPDFException` / message 含 `invalid pdf` | `error.invalidPdf` | 文件不是有效的 PDF |
| 其他 | `error.failedToLoad` | 加载 PDF 失败 |

### 1.4 加密 PDF

`onPassword` 是 **loadingTask 上的回调**（不是 `getDocument` 的参数，这点很容易写错）：

```ts
const loadingTask = pdfjsLib.getDocument({ ... })
loadingTask.onPassword = (updatePassword, reason) => {
  const pw = window.prompt(
    reason === 2 ? t('error.incorrectPassword') : t('error.passwordRequired'),
  )
  if (pw) updatePassword(pw)
}
```

- `reason === 1`：需要密码（NEED_PASSWORD）
- `reason === 2`：密码错误（INCORRECT_PASSWORD）

用户在 `prompt` 里点「取消」时不调用 `updatePassword`，pdf.js 会以 `PasswordException` 结束，走到上面的错误提示。

> 当前用的是原生 `window.prompt`，后续可换成自定义密码弹窗。

### 1.5 重选同一文件

原生 `<input type="file">` 在**重复选择同一个文件**时不会触发 `change`。
`handleFileSelect` 里先 `target.value = ''` 再走加载流程，因此「重选同一个 PDF」能正常重新加载。

---

## 2. 文档加载与资源

### 2.1 Worker

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()
```

Vite 会把它产出为独立 chunk（`dist/assets/pdf.worker.min-*.mjs`）。

### 2.2 四类配套资源（关键修复）

`getDocument` 必须显式给出资源基址，否则 PDF 真正用到对应特性时会**报错或降级渲染**：

```ts
const PDFJS_ASSETS = {
  cMapUrl: `${base}pdfjs/cmaps/`,                  // 中日韩预定义 CMap
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`, // 14 标准字体替代
  wasmUrl: `${base}pdfjs/wasm/`,                   // JBIG2 / JPEG2000 / 色彩管理
  iccUrl: `${base}pdfjs/iccs/`,                    // ICC 配置
}
```

约束：**必须以 `/` 结尾**，且为**同源绝对 URL**（否则 pdf.js 的 `useWorkerFetch` / `isValidFetchUrl` 不生效）。
`base` 取 `import.meta.env.BASE_URL`，子路径部署时自动适配。

资源本身是**按需拉取**的：pdf.js 只在当前 PDF 真正需要某个 `.bcmap` / `.wasm` / 字体文件时，才去 fetch **那一个文件**，不会整目录下载。

### 2.3 构建期拷贝资源

`vite-plugin-static-copy` 把 `node_modules/pdfjs-dist/` 下的资源拷进 `dist/pdfjs/`。
同一份 `vite.config.ts` 按 `--mode` 分两套（详见 [README](./README.md#两套构建产物)）：

| 目录 | 内容 | 精简（`pnpm build`） | 完整（`pnpm build-full`） |
| --- | --- | --- | --- |
| `dist/pdfjs/cmaps/` | `.bcmap` | 73 个 | 168 个 |
| `dist/pdfjs/standard_fonts/` | Foxit `.pfb` + Liberation `.ttf` | 16 | 16 |
| `dist/pdfjs/wasm/` | jbig2 / openjpeg / qcms / quickjs | 3 + LICENSE | 15 |
| `dist/pdfjs/iccs/` | ICC profile | 2 | 2 |
| `dist/pdfjs/images/` | 注解图标 `annotation-*.svg` | 11 | 11 |

必须带 `rename: { stripBase: true }`，否则会按 `src` 路径镜像成
`dist/pdfjs/node_modules/pdfjs-dist/cmaps/`，导致生产环境 404（开发模式被 plugin 中间件兜住，不会暴露）。

`LICENSE*` 文件在两套构建里都保留 —— Apache-2.0 / OFL 要求随分发附带，不能省。

### 2.4 加载生命周期

| 时机 | 行为 |
| --- | --- |
| 换文件 | 先 `await previous.destroy()` 销毁上一个 loadingTask（连带 worker 与文档） |
| 组件卸载 | `loadingTask.destroy()` |
| 并发加载 | `loadIdRef` 自增序号，异步回调里比对，旧加载的结果直接丢弃 |

`loadId` 机制解决的是「快速连续换文件时旧请求后返回，把状态写脏」的问题。

### 2.5 加载进度

加载分两个阶段，共用同一套进度状态（`loadProgress`），但**交互强度不同**：

| 阶段 | 何时 | UI | 是否阻塞阅读区 |
| --- | --- | --- | --- |
| 下载文档 | `loadingTask.promise` 未 resolve（`pdfDoc == null`） | 居中遮罩 `.loading`：文案 + `formatLoadProgress(loaded, total)` | 是（此时无页面可看） |
| 分批取页 | `pdfDoc` 已就绪、页面代理还在批量 `getPage` | 右下角非阻塞角标 `.load-badge`：`已加载页 / 总页数` | **否**（`pointer-events: none`） |

- **下载阶段**：`loadingTask.onProgress = ({ loaded, total }) => ...`。`total > 0` 显示百分比（上限 100%）；`total === 0`（流式，未知大小）降级为 `formatBytes(loaded)`。回调里用 `loadId` 比对，丢弃换文件后的过期更新。
- **分批取页阶段**：进度直接由 `pages.length / numPages` 推导，不额外存状态。

> 关键：第二阶段用 `pointer-events: none` 的浮层而非全屏遮罩，因此**不会挡住阅读区、也不会阻断 `IntersectionObserver` 懒加载**——用户可以在后台批量取页时立即滚动、阅读、触发懒渲染。第一阶段的遮罩只在 `pdfDoc == null` 时出现，那时本就没有页面可渲染。

`formatBytes` / `formatLoadProgress` 是 `src/lib/loadProgress.ts` 的纯函数，便于单测。

---

## 3. 页面加载策略

### 3.1 两段式：先定尺寸，再分批补齐

```
doc.numPages          ← 立即可知（用于渲染 wrapper 与页码）
  ↓
getPage(1)            ← 先拿第 1 页：确定页面尺寸，首屏尽快出现
  ↓
pageBatches(2, N)     ← 其余页按 PAGE_BATCH_SIZE = 24 分批 getPage
```

**为什么必须分批**：一次性 `getPage(1..N)` 对上千页文档会同时发起上千个 worker 请求，
内存与首屏都被拖垮。

**为什么要先取第 1 页**：页面尺寸决定 wrapper 宽度与占位块比例，拿到它才能从第一帧起
就把布局撑对，滚动条不跳变。

### 3.2 占位块

未到达的页渲染 `.page-placeholder`，用首页的宽高比（`aspectRatio`）撑住高度：

```tsx
<div
  className="page-placeholder"
  style={firstViewport ? { aspectRatio: `${w} / ${h}` } : undefined}
/>
```

同一文档内页面尺寸通常一致，因此这个近似几乎总是准确的。

### 3.3 懒加载渲染

- `numPages >= 10` → 每页用 `LazyPDFPage` 包裹，`IntersectionObserver` 的 `rootMargin: '200px'`，
  进入视口附近才开始渲染 canvas，之后 `observer.disconnect()`。
- `numPages < 10` → 直接渲染 `PDFPage`，避免占位闪动。

阈值用**总页数**（`numPages`）而不是已加载页数（`pages.length`），否则分批加载中途会从
「 eager 」翻到「 lazy 」，导致已渲染页面被重挂。

---

## 4. 页面渲染

每页由 `.pdf-page-canvas` 承载，内部自下而上叠四层：

```
┌─ .pdf-page-canvas (position: relative)
│  ├─ canvas.pdf-page-canvas__canvas            页面外观
│  ├─ div.pdf-page-canvas__text-layer           文本层（可选中）
│  └─ div.pdf-page-canvas__annotation-layer     注解层（链接/表单）
└─
```

### 4.1 高分屏适配（DPR）

```ts
const dpr = window.devicePixelRatio || 1
canvas.width  = Math.floor(viewport.width  * dpr)   // backing store
canvas.height = Math.floor(viewport.height * dpr)
canvas.style.width  = `${viewport.width}px`         // CSS 尺寸保持逻辑像素
canvas.style.height = `${viewport.height}px`
const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
```

DPR = 1 时不传 `transform`，走零拷贝路径。

### 4.2 渲染取消

```ts
const renderTask = page.render({ canvas, viewport, transform, annotationMode: ENABLE_FORMS })
return () => {
  renderTask.cancel()      // 缩放切换 / 换文件 / 卸载
  textLayer?.cancel()
  annotationLayer?.destroy()
}
```

不取消会触发 `Cannot use the same canvas during multiple render() operations`。
被取消导致的 `RenderingCancelledException` / `AbortException` 会被 `isCancelled()` 过滤，不算真错误。

### 4.3 为什么用 `AnnotationMode.ENABLE_FORMS`

`page.render` 默认 `annotationMode = ENABLE`（只画注释外观）。
本工程用 `ENABLE_FORMS`：**交互式表单控件从 canvas 排除**，交给注解层渲染成真正的
`<input>` / `<select>`。否则会出现「canvas 画了一遍 + 注解层又画一遍」的重影。

### 4.4 表单控件与 canvas 的对齐

`AnnotationLayer.render()` 内部调用 `setLayerDimensions()`，用
`round(down, var(--total-scale-factor) * 595px, var(--scale-round-x))` 计算容器尺寸。
因此 `.pdf-page-canvas` 上必须定义：

```css
.pdf-page-canvas {
  --scale-round-x: 1px;
  --scale-round-y: 1px;
  --total-scale-factor: 1;  /* 运行时由 JS 写入 viewport.scale */
  --scale-factor: 1;
}
```

`--total-scale-factor` / `--scale-factor` 由 `PDFPage` 在 effect 里写入宿主元素，
文本层与注解层同时继承。

### 4.5 旋转

- `rotation: 0 | 90 | 180 | 270`（`Rotation` 类型），工具栏左转 / 右转按钮经 `rotateBy(rotation, ±90)` 归一化。
- **所有 viewport 计算统一带 rotation**：`page.getViewport({ scale, rotation })`。`PDFPage` 的 effect 依赖含 `rotation`，canvas 尺寸、文本层、注解层因此**共用同一旋转后的 viewport，自动跟随**，无需各自处理。
- 旋转 90°/270° 时 `getViewport` 返回的宽高互换，`.pdf-page-wrapper` 的宽度与占位块 `aspectRatio` 都取自旋转后的 `viewport.width/height`，布局随之翻转。
- 换文件时 `rotation` 重置为 0。
- **旋转后重新定位到当前页**：旋转会改变页面尺寸与内容高度，若不动 `scrollTop` 视口会漂移到别的位置。`PdfViewer` 用 `useLayoutEffect([rotation])` 在绘制前调用 `goToPage(currentPage)`，把当前页重新对齐到顶部（`useLayoutEffect` 保证无闪烁）。**≤ 2 页时跳过**（几乎不漂移，无必要）。
- 页码定位不受影响：各页 `offsetTop` 始终来自真实布局，`pageAtScrollTop` 反推当前页依旧准确。

---

## 5. 文本层

```ts
const textLayer = new pdfjsLib.TextLayer({   // v6 是 class，必须 new
  textContentSource: page.streamTextContent(),
  container: textLayerDiv,
  viewport,
})
await textLayer.render()
```

能力：

- 鼠标**选中 / 复制**页面文字（透明文字 + `::selection` 高亮）
- 为将来的全文搜索提供 DOM 基础
- 文本位置用百分比定位、字号由 `--font-height` × `--total-scale-factor` 推导，
  缩放时自动跟随

失败降级：`TextLayer` 构造或 `render()` 抛错时只 `console.warn`，不影响 canvas 渲染。

---

## 6. 注解层（链接 / 表单）

pdfjs-dist 主包导出了 `AnnotationLayer`，但**没有导出** `AnnotationStorage` 与
`PDFLinkService`（它们在 `web/` 目录）。`src/lib/annotation.ts` 用最小鸭子类型补齐。

### 6.1 链接

| 类型 | 行为 |
| --- | --- |
| 外链（URI） | `addLinkAttributes` 写入 `href`；PDF 声明新窗口时加 `target="_blank" rel="noopener noreferrer"` |
| 内部跳转 | pdf.js 的 `link.onclick` → `linkService.goToDestination(dest)` → `onGotoPage(页码)` |

内部链接的 `dest` 形如 `[{num: 20, gen: 0}, {name: 'Fit'}]`，第 0 项是**对象引用**，
同步代码拿不到页号。`createDestResolver` 负责异步解析：

| dest 形态 | 解析方式 |
| --- | --- |
| `number` | `页号 = n + 1`（0-based → 1-based） |
| `[{num, gen}]` | `pdfDoc.getPageIndex(ref)` |
| `'name'`（命名目标） | `pdfDoc.getDestination(name)` → 再解析其第 0 项 |

`getDestinationHash` 是同步的，只能处理数字形态，其余返回空串；
实际跳转由 `onclick` → `goToDestination` 完成，所以 `href` 为空不影响功能。

### 6.2 表单

- 支持：文本输入框、复选框、单选、下拉（pdf.js 渲染成原生表单元素）
- 位置 / 尺寸由注解矩形按百分比铺在 canvas 上，缩放自动跟随
- 悬停显示 accent 描边，聚焦有 focus ring

### 6.3 表单值持久化（关键细节）

pdf.js 的文本控件在 `input` 事件里只存 `{ value }`：

```js
storage.setValue(id, { value: event.target.value })
```

而重新渲染时回填的是：

```js
const storedData = storage.getValue(id, { value: this.data.fieldValue })
let fieldFormattedValues = storedData.formattedValue || this.data.textContent?.join("\n") || null
element.setAttribute("value", fieldFormattedValues ?? textContent)
```

由于 `formattedValue` 没被存过，会回落到 `data.textContent`（PDF 原值），
**于是缩放 / 翻页后用户输入的内容会被原值覆盖**。

本工程在 `createAnnotationStorage().setValue()` 里补一份镜像：

```ts
if (typeof patch.value === 'string' && patch.formattedValue === undefined) {
  patch.formattedValue = patch.value
}
```

从而让文本域的输入在注解层重建后依然保留。复选框走的是另一套控件实现，本身就能保留。

> 这是对 pdfjs 原生 `AnnotationStorage` 的**兼容偏离**。目前没有「保存表单」功能所以无副作用；
> 若将来做表单导出，需回看这段。

### 6.4 存储作用域

`AnnotationStorage` 必须是**每文档一个实例**（`PdfViewer` 用 state 持有）。
做成每页一个会导致表单值跨页不同步；做成全局一个会导致换文件后串值。

### 6.5 注解图标

`imageResourcesPath` 指向 `${base}pdfjs/images/`，构建时拷贝 11 个 `annotation-*.svg`
（note / help / insert / key / paperclip / pushpin 等）。

---

## 7. 导航

### 7.1 页码

- 工具栏右侧：`‹ 1 / N ›`
- 滚动时通过各 `.pdf-page-wrapper` 的 `offsetTop` 反推当前页（`pageAtScrollTop`）
- 点击上/下一页 → `goToPage(n)`：取目标 wrapper 的 `offsetTop`，`clampScrollTop` 夹紧后滚动
- 首页禁用「上一页」，末页禁用「下一页」

### 7.2 目录（Outline）

`pdfDoc.getOutline()` → 递归 `doc.getDestination(dest)` 解析目标页 →
树形渲染：

- 有子项显示 `▸ / ▾` 折叠三角，点击切换展开
- 无子项点击直接跳转
- 目标页为 `0`（无法解析）时不显示页码、点击无动作
- 无目录时显示「此 PDF 无目录」

### 7.3 虚拟滚动条（minimap）

隐藏原生滚动条，右侧自绘：

- **几何**：`computeThumbMetrics()` 按「视口高度 / 内容高度」算滑块高度，
  受 `MIN_THUMB_HEIGHT = 96` 下限约束；位置与 `scrollTop` 线性对应
- **不可滚动时**：滑块铺满轨道、`aria-disabled="true"`
- **交互**：拖拽滑块、点击轨道跳转、滚轮、`ArrowUp/Down`、`Home/End`、`PageUp/Down`
- **同步**：`handleScroll` 同时更新滑块与容器 `scrollTop`，双向不冲突
- **无障碍**：`role="scrollbar"` + `aria-valuemin/max/now`、`aria-controls`、`aria-orientation`

### 7.4 键盘导航

全局监听 `keydown`，**输入框内不劫持**（`isEditableTarget`）：

| 按键 | 行为 |
| --- | --- |
| `ArrowDown` / `ArrowUp` | 滚动 80px |
| `PageDown` / `PageUp` | 滚动 90% 视口高度 |
| `Home` / `End` | 跳到顶部 / 底部 |

### 7.5 单页 / 双页

`layoutMode: 'single' | 'double'`：

- 单页：纵向单列
- 双页：`.pdf-pages--double` 使用 CSS Grid，**列宽固定为「多数页宽」**（运行时不内联 `grid-template-columns: repeat(2, <多数页宽*scale>px)`），`justify-content: center` 居中，`justify-items: center` 让页在列内居中。

总页数 < 2 时禁用切换。

### 7.6 双页模式下的超大页

同一文档里偶有比多数页大很多的页（如年鉴的折页 / 横版插页，本仓库实测样本 879×1191 vs 多数 652×850）。

**判定**：以「多数页宽度」（`computeReferenceWidth` 取众数）为基准，`isOversizePage` 判断某页宽度偏离基准是否 **> 10%**。

**处理**（仅双页模式）：

| 方面 | 做法 |
| --- | --- |
| 独占一行 | 超大页加 `.is-oversize` → `grid-column: 1 / -1` 跨两列，不与普通页同行 |
| 保持大小 | 默认按原始尺寸渲染（不缩放） |
| 最大宽度 | 不超过「两页宽」`oversizeMaxWidth = 2*多数页宽 + 间距`；超出则等比缩小（per-page `renderScale`） |
| 稍作突出 | 强调色描边 + 左上角强调色徽标（`ExpandIcon`，`title` 走 i18n `page.oversize`） |

**为什么不用 `repeat(2, max-content)`**：那会把**列宽撑到该列最宽的一页**，导致所有普通页在超宽列里左对齐、居中失效。固定列宽 + 超大页跨列可避免。

**取舍**：超大页跨两列会让它**前一张**普通页暂时落单（右侧留空）——这是 Grid 自动排布的必然结果；未启用 `grid-auto-flow: dense`，因为 dense 会打乱阅读顺序（回填后面的页到前面空位）。基准宽度用 `useMemo` 缓存（依赖 `pages`/`rotation`），避免滚动时重复 `getViewport`。

---

## 8. 缩放

| 方式 | 步长 | 范围 |
| --- | --- | --- |
| `−` / `+` 按钮 | 25%（`BUTTON_ZOOM_STEP`） | 50% – 300% |
| 百分比输入框 | 直接输入 | 50% – 300%（越界自动回写边界值） |
| `Ctrl` / `Cmd` + 滚轮 | 10%（`WHEEL_ZOOM_STEP`） | 50% – 300% |

`Ctrl/Cmd + 滚轮` 用 `{ passive: false }` 监听 `window`，`preventDefault()` 阻止浏览器页面缩放。
所有缩放入口都经 `clampScale` / `stepZoom` 纯函数夹紧，便于单测。

缩放变化会触发 `PDFPage` 的 effect 重跑：取消上一帧渲染 → 重算 canvas 尺寸 → 重建文本层与注解层。

---

## 9. 界面与外观

| 能力 | 说明 |
| --- | --- |
| 主题 | 浅色 / 深色；首次跟随系统 `prefers-color-scheme`，之后手动切换并记住 |
| 国际化 | 中文 / 英文；首次跟随浏览器语言，之后手动切换并记住 |
| Tooltip | 纯 CSS（`data-tooltip` + `::after`），悬停与键盘聚焦均触发，带 300ms 延迟 |
| Slider | 分段图标滑块（单页/双页、中文/English），支持鼠标点击、拖拽与 `←/→` |
| 属性弹窗 | 文件名、作者、主题、创建者、生成器、创建/修改时间、页数、当前缩放；空值显示「未知」 |
| 响应式 | 窄屏下工具栏自动换行重排 |

---

## 10. 可访问性

### 10.1 模态框焦点管理

`useFocusTrap` 提供三个能力：

1. **初始焦点**：打开时聚焦容器内第一个可聚焦元素
2. **Tab 陷阱**：监听 `document` 的**捕获阶段** `keydown`，Tab / Shift+Tab 到边界时手动循环，
   即使焦点被点到背景也能拉回
3. **焦点还原**：关闭后回到 `returnFocusRef`（属性按钮）；未指定时回退到打开前的 `activeElement`

Escape 由同一钩子处理，关闭后同样还原焦点。

### 10.2 已有 ARIA

- 虚拟滚动条：`role="scrollbar"` + 完整 `aria-value*`
- 所有图标按钮：`aria-label`
- 模态框：`role="dialog"` + `aria-modal` + `aria-labelledby`
- 装饰性 SVG / 页码轨道：`aria-hidden`

### 10.3 尚缺（见 PLAN.md）

目录树、`page-info` 的实时播报等暂无 ARIA。

---

## 11. 关键参数速查

| 参数 | 值 | 位置 |
| --- | --- | --- |
| 缩放下限 / 上限 | 0.5 / 3.0 | `interaction.ts` |
| 按钮缩放步长 | 0.25 | `interaction.ts` |
| 滚轮缩放步长 | 0.1 | `interaction.ts` |
| 方向键滚动 | 80px | `interaction.ts` |
| PageUp/Down 比例 | 0.9 视口 | `interaction.ts` |
| 旋转档位 | 0 / 90 / 180 / 270 | `interaction.ts`（`rotateBy`） |
| 虚拟滑块最小高度 | 96px | `pdfLayout.ts` |
| 超大页判定阈值 | 10% | `pdfLayout.ts`（`OVERSIZE_RATIO`） |
| 超大页最大宽度 | 2×多数页宽 + 间距 | `pdfLayout.ts`（`oversizeMaxWidth`） |
| 懒加载阈值 | 10 页 | `PdfViewer.tsx` |
| 懒加载预加载边距 | 200px | `LazyPDFPage.tsx` |
| 分批取页大小 | 24 页 | `pdfLoading.ts` |
| 加载进度格式化 | `formatBytes` / `formatLoadProgress` | `loadProgress.ts` |
| 注解图标路径 | `${BASE_URL}pdfjs/images/` | `annotation.ts` |

---

## 12. 目录结构

```
src/
├── app.tsx                      # 应用根组件
├── app.css                      # 全局样式 + 设计变量
├── components/
│   ├── PdfViewer.tsx            # 主组件：加载、布局、导航、快捷键
│   ├── PDFPage.tsx              # 单页渲染：canvas + 文本层 + 注解层
│   ├── LazyPDFPage.tsx          # IntersectionObserver 懒加载包装
│   ├── VirtualScrollbar.tsx     # 虚拟滚动条
│   ├── OutlinePanel.tsx         # 目录树
│   ├── PropBtn.tsx              # 文档属性按钮 + 模态框
│   ├── Slider.tsx               # 分段图标滑块
│   ├── LanguageSlider.tsx       # 语言切换
│   ├── ThemeToggle.tsx          # 主题切换
│   ├── Tooltip.tsx              # 纯 CSS 提示
│   ├── ThumbnailSidebar.tsx     # 缩略图侧栏（仅类型骨架，未启用）
│   └── __tests__/               # 组件测试
├── lib/
│   ├── pdfLayout.ts             # 滑块几何 / 滚动夹紧 / 超大页判定（纯函数）
│   ├── pdfLoading.ts            # 分批取页（纯函数）
│   ├── pageNav.ts               # 页码定位（纯函数）
│   ├── interaction.ts           # 缩放 / 旋转 / 键盘（纯函数）
│   ├── loadProgress.ts          # 加载进度格式化（纯函数）
│   ├── annotation.ts            # 注解层接入 + 存储 + 链接解析
│   ├── useFocusTrap.ts          # 焦点陷阱
│   └── __tests__/               # 纯函数测试
├── i18n/
│   ├── index.ts
│   └── locales/{zh,en}.json
└── test/
    └── setup.ts
```

设计原则：**几何与状态计算全部下沉到 `lib/` 的纯函数**，组件只负责 DOM 与事件，
因此绝大部分逻辑可以脱离浏览器做单元测试。