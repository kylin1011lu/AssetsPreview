# AssetsPreview — Copilot 工作规范

## 技术栈

- **框架**: Vue 3 + Composition API (`<script setup>`), TypeScript, Vite 5
- **样式**: UnoCSS / Tailwind utility classes + scoped `<style>`
- **渲染**: PixiJS 7 (DragonBones 和 Spine 均使用 PixiJS 渲染)
- **Spine**: `pixi-spine@4.0.6` — 包含 3.7/3.8/4.0/4.1 全版本运行时
- **构建产物**: `vite-plugin-singlefile` → 单文件 `dist/index.html`

## 文件布局规范

### 临时文件 / 调试产物 — 严格禁止提交到版本库

- **根目录不得出现** `.bak`、`.new`、`.tmp` 文件和一次性脚本（如 `check-build.mjs`）
- **调试输出**（如 `*.txt` 诊断文件）统一放入 `temp/`（已 gitignore，没用了立即删）
- **辅助脚本**（构建验证、类型检查等）放入 `tools/`，写完即删或长期保留均可，不放根目录
- **备份文件不需要手动创建** — 用 git history 恢复即可；如确实需要临时备份，操作完成后立即删除

### 目录用途

| 目录 | 用途 | Git |
|---|---|---|
| `src/` | 源码 | ✅ 提交 |
| `tools/` | 开发辅助脚本 | ✅ 提交（可复用脚本）/ 用完即删（一次性） |
| `temp/` | 运行时临时产物、调试输出 | ❌ gitignore |
| `dist/` | 构建产物 | ❌ gitignore |
| `docs/` | 项目文档和规范说明 | ✅ 提交 |

完整规范见 [`docs/conventions.md`](../docs/conventions.md)。

## 代码规范

- 优先编辑已有文件，不要无端新增文件
- 不添加多余的注释、docstring、错误处理（除非逻辑不直观或位于系统边界）
- PixiJS 应用生命周期：创建 → `addChild` → `ticker` → `destroy(true, { children: true })`
- 销毁前调用 `PIXI.utils.clearTextureCache()` 避免内存泄漏
