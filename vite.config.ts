import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { viteStaticCopy, type Target } from 'vite-plugin-static-copy'

/**
 * 两套构建
 * ========
 * - `pnpm build`       → 精简（slim，默认）：剔除 quickjs 与 nowasm 兜底，cmaps 只保留常用横排
 * - `pnpm build-full`  → 完整（full）：pdfjs-dist 原样资源全带
 *
 * 切换方式是 `vite build --mode full`，同一份 `vite.config.ts` 内部分支，**不新增配置文件**。
 *
 * 为什么能只靠拷贝差异区分：应用代码完全不关心这两套资源，
 * pdf.js 只会在「PDF 真的用到某个资源」时去 fetch，缺文件就降级 / 报错。
 */

const PDFJS = 'node_modules/pdfjs-dist'

/**
 * 精简构建里 cmaps 的剔除规则（= R2 方案）。
 *
 * 169 个 .bcmap 里大部分是竖排 `-V` 变体与 1990 年代的编码，
 * 现代横排文档基本不会用到。注意 .bcmap 单文件只有几 KB，
 * 砍它们主要是让文件数看着合理，省体积有限；体积大头在 wasm。
 */
const SLIM_CMAP_EXCLUDE = [
  // 竖排变体（-V 后缀）
  `!${PDFJS}/cmaps/**/*-V.bcmap`,
  // 早期日文编码（JIS 78 / 83pv / 90ms / 90msp / 90pv）
  `!${PDFJS}/cmaps/78-*`,
  `!${PDFJS}/cmaps/83pv-*`,
  `!${PDFJS}/cmaps/90ms-*`,
  `!${PDFJS}/cmaps/90msp-*`,
  `!${PDFJS}/cmaps/90pv-*`,
  // Adobe 扩展 / 补充
  `!${PDFJS}/cmaps/Add-*`,
  `!${PDFJS}/cmaps/Ext-*`,
  // 非 Unicode 的中日韩扩展编码
  `!${PDFJS}/cmaps/GBK2K-*`,
  `!${PDFJS}/cmaps/GBKp-*`,
  `!${PDFJS}/cmaps/GBT-*`,
  `!${PDFJS}/cmaps/GBTpc-*`,
  `!${PDFJS}/cmaps/GBpc-*`,
  `!${PDFJS}/cmaps/HK*`,
  `!${PDFJS}/cmaps/NWP-*`,
  `!${PDFJS}/cmaps/KSCpc-*`,
  `!${PDFJS}/cmaps/CNS-EUC-*`,
  `!${PDFJS}/cmaps/ETHK-*`,
]

/**
 * 精简构建里 wasm 的白名单。
 *
 * 只留渲染真正会用到的 3 个：
 * - jbig2.wasm    JBIG2 二值图像
 * - openjpeg.wasm JPEG2000
 * - qcms_bg.wasm  ICC 色彩管理
 *
 * 被剔除的：
 * - quickjs-eval.wasm (458 KB) / .js (6 KB) —— 仅 pdf.sandbox.mjs 与完整 viewer 使用，
 *   我们的库入口 pdf.mjs / pdf.worker.mjs 对它 0 引用
 * - jbig2_nowasm_fallback.js (129 KB) / openjpeg_nowasm_fallback.js (330 KB) ——
 *   wasm 加载失败时的纯 JS 兜底；slim 版选择不支持该兜底，需要时用 build-full
 *
 * LICENSE_* 无论哪套构建都保留（Apache-2.0 / OFL 要求随分发附带，不能删）。
 */
const SLIM_WASM_INCLUDE = [
  `${PDFJS}/wasm/jbig2.wasm`,
  `${PDFJS}/wasm/openjpeg.wasm`,
  `${PDFJS}/wasm/qcms_bg.wasm`,
  `${PDFJS}/wasm/LICENSE_*`,
]

/** 构建 pdfjs-dist 的配套资源拷贝目标 */
function pdfTargets(full: boolean): Target[] {
  // stripBase 必须开：否则会按 src 路径镜像成 pdfjs/node_modules/pdfjs-dist/cmaps/
  const rename = { stripBase: true } as const

  const cmapSrc = full
    ? [`${PDFJS}/cmaps`]
    : [`${PDFJS}/cmaps/**/*.bcmap`, ...SLIM_CMAP_EXCLUDE, `${PDFJS}/cmaps/LICENSE`]

  const wasmSrc = full ? [`${PDFJS}/wasm`] : SLIM_WASM_INCLUDE

  return [
    { src: cmapSrc, dest: 'pdfjs/cmaps', rename },
    { src: [`${PDFJS}/standard_fonts`], dest: 'pdfjs/standard_fonts', rename },
    { src: wasmSrc, dest: 'pdfjs/wasm', rename },
    { src: [`${PDFJS}/iccs`], dest: 'pdfjs/iccs', rename },
    {
      // 注解图标（annotation-*.svg），供 AnnotationLayer 的 imageResourcesPath 使用
      src: [`${PDFJS}/web/images/annotation-*.svg`],
      dest: 'pdfjs/images',
      rename,
    },
  ]
}

export default defineConfig(({ mode }) => {
  const full = mode === 'full'

  return {
    plugins: [
      preact(),
      viteStaticCopy({
        targets: pdfTargets(full),
      }),
    ],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },
  }
})
