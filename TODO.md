# PDF Everything - 项目待办事项

## 项目初始化
- [x] 使用 Vite + Preact + TypeScript 初始化项目
- [x] 安装依赖：pdfjs-dist、preact、preact-render-to-string
- [x] 配置 Vite 以支持 PDF.js worker
- [x] 搭建基础项目结构

## 核心功能
- [x] 创建拖拽上传 PDF 区域
- [x] 实现 PDF.js 文档加载
- [x] 创建 PDF 页面渲染组件
- [x] 实现虚拟滚动条组件

## 渲染策略
- [x] **小 PDF（< 10 页）**：一次性加载所有页面
- [x] **大 PDF（≥ 10 页）**：基于视口的懒加载
- [x] 实现 IntersectionObserver 进行视口检测
- [x] 为页面组件添加 Preact 懒加载

## 虚拟滚动条
- [x] 根据页面尺寸计算总滚动高度
- [x] 渲染与视口成比例的滚动条滑块
- [x] 处理滚动条拖拽事件
- [x] 将虚拟滚动与 PDF 面板滚动同步
- [x] 隐藏原生滚动条，显示自定义虚拟滚动条

## UI/UX
- [x] PDF 页面加载状态
- [x] PDF 加载失败的错误处理
- [x] 页码指示器
- [x] 响应式布局
- [x] Zoom input (mini input for zoom level)
- [x] Toolbar layout: left/center/right
- [x] Gear icon for PDF properties modal
- [x] PDF properties modal (metadata, stats)
- [x] Theme toggle (sun/moon icon) with light/dark mode
- [x] Polished CSS with CSS variables, animations, shadows, transitions

## 完善优化
- [x] 添加键盘导航（方向键、Page Up/Down、Home/End）
- [x] 缩放控制：+/- 按钮、输入框、Ctrl/Cmd+滚轮接管浏览器缩放
- [ ] 性能优化
- [x] 编写测试（Vitest + Testing Library，覆盖高度/滚动条/主题/属性弹窗/键盘导航/Ctrl+滚轮缩放）
- [x] 包管理器统一为 pnpm（packageManager + preinstall 限制）
- [x] 修复 pdf-pages 高度被截断问题，按内容真实高度撑开，隐藏原生滚动条
- [x] 组件拆分：VirtualScrollbar、PropertiesModal、LazyPDFPage、PDFPage 独立文件
- [x] 各组件独立 CSS 文件，不再混在 app.css
- [x] 添加中文注释
- [x] 国际化：react-i18next 集成，支持中英文切换
- [x] 组件拆分：ThemeToggle、PropBtn（属性按钮+模态框）独立文件
- [x] 滑块组件（Slider）：分段图标滑块，支持鼠标点击与键盘方向键切换
- [x] 工具栏单页/双页布局切换（SVG 图标 + 双页网格布局）
- [x] 纯图标按钮统一 Tooltip（悬停/聚焦提示）