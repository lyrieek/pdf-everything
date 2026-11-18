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
| `src/lib/__tests__/pdfLoading.test.ts` | `pageBatches` 分批切页（每批大小、边界、空区间） |
| `src/lib/__tests__/annotation.test.ts` | `createAnnotationStorage`（含 formattedValue 镜像）、`createDestResolver`（数字/对象引用/命名目标）、`createLinkService`（hash/外链属性/跳转） |
| `src/lib/__tests__/useFocusTrap.test.tsx` | 焦点陷阱：初始焦点、Tab 循环、Escape 关闭、焦点还原 |

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
| 选中文本 | 高亮显示（半透明蓝色） |

#### 页码导航

| 场景 | 预期结果 |
|------|----------|
| 工具栏右侧 | 显示「‹ 1 / N ›」 |
| 点击「下一页」 | 滚动到下一页顶部，页码更新 |
| 点击「上一页」 | 滚动到上一页顶部 |
| 第 1 页时 | 「上一页」按钮禁用 |
| 最后一页时 | 「下一页」按钮禁用 |
| 滚动后 | 页码指示器自动更新 |

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

#### 焦点管理（模态框）

| 场景 | 预期结果 |
|------|----------|
| 点击属性按钮 | 焦点落在模态框内第一个可聚焦元素（关闭按钮） |
| 连续按 Tab | 焦点只在「关闭 / 确定」之间循环，不会跑到背景页 |
| Shift+Tab | 反向循环，同样不出模态框 |
| 按 Escape | 模态框关闭，焦点回到「PDF 属性」按钮 |
| 点击遮罩空白处 | 模态框关闭，焦点同样回到「PDF 属性」按钮 |

---

## 三、验收清单

- [ ] `pnpm test` 全部通过（80 个测试）
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
- [ ] 中英文 i18n 正常

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