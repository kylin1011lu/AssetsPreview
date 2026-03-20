# GameAssetViewer

一个**纯前端**游戏资源预览工具，无需后端服务、无需安装，直接在浏览器中读取本地 Cocos Creator 资源文件夹，实现全类型资源的可视化浏览与播放。

## 功能特性

| 资源类型 | 支持能力 |
|---|---|
| 图片（PNG / JPG / WebP / GIF 等）| 缩放 / 平移预览，25%–400% |
| 音频（MP3 / OGG / WAV 等）| 播放器，进度条，音量，循环 |
| 图集（Plist / TexturePacker JSON）| 全图预览 + 子 Sprite 列表，支持旋转帧 |
| DragonBones（_ske.json + _tex.json + _tex.png）| PixiJS 实时播放，动画切换，速度控制 |
| Spine（.json + .atlas + .png）| spine-player 实时播放，动画 / 皮肤切换 |
| TTF / OTF / WOFF 字体 | FontFace API 动态加载，多尺寸字样预览 |
| BMFont（.fnt + .png）| Canvas 渲染，自定义文字输入 |

**通用功能：**
- 文件夹选取（File System Access API，支持大型项目 8000+ 文件）
- 目录树导航 + 按资源类型过滤
- 模糊搜索（Fuse.js）
- 排序（名称 / 大小 / 时间，升降序）
- 右键菜单：复制相对路径 / 文件名
- 构建为**单个 HTML 文件**，可离线使用

## 技术栈

- [Vue 3](https://vuejs.org/) + Composition API + `<script setup>`
- [Vite 5](https://vitejs.dev/) + [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) — 输出单文件 HTML
- [TypeScript](https://www.typescriptlang.org/)
- [UnoCSS](https://unocss.dev/) — 原子化 CSS
- [Pinia](https://pinia.vuejs.org/) — 状态管理
- [PixiJS 7](https://pixijs.com/) — DragonBones 渲染后端
- [Fuse.js](https://www.fusejs.io/) — 模糊搜索

## 快速开始

### 依赖环境

- Node.js ≥ 18
- npm ≥ 9

### 安装与开发

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`

### 生产构建

```bash
npm run build
```

产物为 `dist/index.html`（单文件，约 650 KB / 200 KB gzip），可直接双击在浏览器中打开。

## 可选：离线动画运行时

DragonBones 和 Spine 运行时通过动态脚本加载，默认先尝试本地 `/vendor/` 目录，找不到则回退到 CDN。

如需完全离线使用，将对应文件放到 `public/vendor/`：

| 文件名 | 来源 |
|---|---|
| `dragonbones-pixi.js` | [DragonBonesJS GitHub](https://github.com/DragonBones/DragonBonesJS) → `Pixi/out/DragonBonesPixi.min.js` |
| `spine-player-3.8.js` | [EsotericSoftware](https://esotericsoftware.com/spine-player) |
| `spine-player-3.6.js` | 同上（如项目使用 3.6 版本） |

## 项目结构

```
src/
├── components/          # UI 组件（文件夹选取、目录树、资源卡片等）
├── core/
│   ├── parsers/         # Plist / FNT 解析器
│   ├── assetIndex.ts    # Fuse.js 搜索索引
│   ├── fileReader.ts    # File System Access API 封装
│   └── scanner.ts       # 资源识别与扫描
├── stores/              # Pinia 状态（assetStore, previewStore）
├── types/               # TypeScript 类型定义
├── utils/               # scriptLoader 等工具函数
└── viewers/             # 各类型预览组件
    ├── ImageViewer.vue
    ├── AudioViewer.vue
    ├── PlistViewer.vue
    ├── DragonBonesViewer.vue
    ├── SpineViewer.vue
    ├── TtfViewer.vue
    └── FntViewer.vue
```

## 浏览器兼容性

推荐使用 **Chrome 86+** 或 **Edge 86+**（需要 File System Access API）。

Firefox / Safari 降级为 `<input webkitdirectory>` 上传模式，功能相同但无法访问历史记录。

## License

[MIT](LICENSE)
