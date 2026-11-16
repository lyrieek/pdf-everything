# PDF Everything

一个基于 Vite + Preact + TypeScript 的纯前端 PDF 阅读器。无需后端，打开页面即可拖拽或选择本地 PDF 文件进行浏览，重点解决了大文档的首屏性能、滚动体验与阅读界面细节。

## 功能特性

- **本地文件打开**：支持拖拽 PDF 到阅读区，或通过工具栏按钮选择文件。
- **按需渲染**：少于 10 页的小文档一次性渲染；10 页及以上的大文档基于 `IntersectionObserver` 进入视口后再渲染。
- **虚拟滚动条**：隐藏浏览器原生滚动条，提供与文档高度成比例的迷你地图滑块，支持拖拽、点击轨道、滚轮与键盘操作。
- **缩放控制**：工具栏 `−` / `+` 按钮、百分比输入框、`Ctrl` / `Cmd` + 滚轮缩放，范围 50%–300%。
- **页面布局**：单页 / 双页切换，双页模式使用两列网格排列。
- **键盘导航**：方向键、`Page Up` / `Page Down`、`Home` / `End` 快速滚动。
- **文档属性**：查看文件名、作者、主题、创建/生成工具、创建/修改时间、页数与当前缩放。
- **深色 / 浅色主题**：跟随系统偏好初始化，可手动切换。
- **中英文界面**：内置国际化，自动匹配浏览器语言并记住用户选择。
- **错误提示**：非 PDF 文件、加载失败等场景均有明确提示。
- **响应式布局**：窄屏下工具栏自动换行重排。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 构建工具 | Vite 8 |
| UI 框架 | Preact 11（`react` / `react-dom` 通过 `@preact/compat` 兼容） |
| 语言 | TypeScript |
| PDF 渲染 | pdfjs-dist |
| 国际化 | i18next + react-i18next |
| 测试 | Vitest + Testing Library + jsdom |
| 格式化 / 类型检查 | oxfmt + tsc |

## 快速开始

环境要求：Node.js >= 20，pnpm >= 10。项目通过 `preinstall` 脚本强制使用 pnpm。

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://localhost:5173）
pnpm dev
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 类型检查并构建生产产物到 `dist/` |
| `pnpm preview` | 本地预览生产构建 |
| `pnpm test` | 以单次运行模式执行全部测试 |
| `pnpm test:watch` | 监听文件变化执行测试 |
| `pnpm lint` | 检查代码格式并执行 TypeScript 类型检查 |
| `pnpm format` | 使用 oxfmt 写入格式化结果 |
| `pnpm format:check` | 只检查格式，不修改文件 |

## 目录结构

```
.
├── index.html                  # 页面入口
├── vite.config.ts              # Vite 配置（PDF.js worker 以 ES 模块构建）
├── vitest.config.ts            # Vitest 配置（jsdom 环境）
├── src
│   ├── main.tsx                # 应用挂载与 i18n 初始化
│   ├── app.tsx                 # 根组件
│   ├── app.css                 # 阅读器整体布局与主题变量
│   ├── index.css               # 全局基础样式
│   ├── components
│   │   ├── PdfViewer.tsx       # 主组件：加载、缩放、滚动、工具栏
│   │   ├── PDFPage.tsx         # 单页 canvas 渲染
│   │   ├── LazyPDFPage.tsx     # 视口内懒加载包装
│   │   ├── VirtualScrollbar.tsx# 虚拟滚动条 / 迷你地图
│   │   ├── ThemeToggle.tsx     # 主题切换
│   │   ├── Slider.tsx          # 通用分段滑块
│   │   ├── LanguageSlider.tsx  # 中英文切换
│   │   ├── PropBtn.tsx         # 属性按钮与模态框
│   │   ├── Tooltip.tsx         # 纯 CSS 悬浮提示
│   │   └── __tests__           # 组件与交互测试
│   ├── lib
│   │   ├── pdfLayout.ts        # 滚动条几何、滚动边界与内容高度计算
│   │   └── interaction.ts      # 缩放、键盘滚动等纯函数
│   ├── i18n
│   │   ├── index.ts            # i18next 初始化与语言持久化
│   │   └── locales           # 中英文文案
│   └── test/setup.ts           # jsdom 环境补丁（matchMedia、Observer 等）
├── TODO.md                     # 完成情况与待办
└── PLAN.md                     # 资源完整性与功能补齐计划
```

## 实现要点

### 渲染策略

- 页数小于 10：直接渲染全部页面，避免懒加载带来的占位跳动。
- 页数大于等于 10：每页由 `LazyPDFPage` 包裹，元素距离视口 200px 时开始渲染。
- 页面容器高度由真实内容撑开，不写死像素高度，避免 canvas 被裁剪。

### 虚拟滚动条

`src/lib/pdfLayout.ts` 负责纯几何计算：滑块高度按「视口高度 / 内容高度」的比例缩放，并受最小高度约束；滑块位置与 `scrollTop` 线性对应，所有滚动值统一经 `clampScrollTop` 夹紧在合法区间。组件层只负责指针、滚轮与键盘事件，便于单元测试。

## 交互速查

| 操作 | 效果 |
| --- | --- |
| 拖拽 PDF 到阅读区 | 打开文件 |
| `Ctrl` / `Cmd` + 滚轮 | 缩放文档（同时阻止浏览器页面缩放） |
| `−` / `+` 按钮 | 按 25% 步长缩放 |
| 方向键 | 上下滚动 80px |
| `Page Up` / `Page Down` | 滚动约一屏 |
| `Home` / `End` | 跳到文档顶部 / 底部 |

## 测试

测试覆盖以下方面：

- 页面总高度、滚动边界与滑块几何计算
- 虚拟滚动条的拖拽、点击轨道、滚轮、键盘与无障碍属性
- 页面渲染数量、容器高度不被截断、原生滚动条隐藏
- 主题切换、属性弹窗打开/关闭、按钮禁用状态
- 键盘导航与输入框焦点保护
- `Ctrl` + 滚轮缩放及缩放范围限制
- 单页 / 双页布局切换、语言滑块与 Tooltip 挂载

运行 `pnpm test` 即可执行。

## 已知限制与后续计划

- **PDF.js 配套资源尚未接入**：`getDocument` 目前只传入文件数据，未配置 `cMapUrl`、`standardFontDataUrl`、`wasmUrl`、`iccUrl`。当 PDF 真正用到非嵌入中日韩字体、JBIG2 / JPEG2000 图像或 ICC 色彩管理时会降级或报错。修复方案见 `PLAN.md`。
- **渲染任务未取消**：缩放或更换文件时未调用 `RenderTask.cancel()`，极端情况下可能出现 canvas 重复渲染警告。
- **未适配高分屏**：canvas 未按 `devicePixelRatio` 放大，DPR 大于 1 的屏幕上文字可能偏模糊。
- **未销毁文档实例**：更换文件或卸载时未调用 `pdfDoc.destroy()` 与 `loadingTask.destroy()`。
- **缺少文本层**：暂不支持文字选中、复制与全文搜索。
- **导航能力有限**：无页码跳转、目录、缩略图侧栏。
- **显示与标注**：无旋转、适合宽度 / 页面等适配模式；链接与表单暂不可交互。
- **深度优化待做**：复用 worker、按需分批 `getPage`、加载进度、移动端手势等。
- `TODO.md` 中仅剩「性能优化」一项未完成。

详细分析与优先级建议请参阅 `PLAN.md`。
