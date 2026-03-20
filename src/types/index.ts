// ============================================================
// Asset Types
// ============================================================

export type AssetType =
  | 'image'
  | 'audio'
  | 'atlas'        // Plist atlas
  | 'dragonbones'
  | 'spine'
  | 'ttf'          // TTF/OTF/WOFF font
  | 'fnt'          // BMFont bitmap font

/** Virtual filter key: 'image-all' includes image+atlas+dragonbones+spine+fnt */
export type TypeFilter = AssetType | 'image-all'

export type SortField = 'name' | 'size' | 'mtime'
export type SortOrder = 'asc' | 'desc'
export type ViewMode = 'grid' | 'list'
export type ThumbnailSize = 80 | 120 | 180

// ============================================================
// Raw file entry from scanner
// ============================================================

export interface FileEntry {
  name: string
  /** full virtual path: e.g. "assets/chapter/bg.png" */
  path: string
  /** relative path from the root folder */
  relPath: string
  /** directory path */
  dirPath: string
  size: number
  lastModified: number
  /** File System Access API handle (if available) */
  handle?: FileSystemFileHandle
  /** fallback File object (webkitdirectory mode) */
  file?: File
}

// ============================================================
// Asset item — one logical asset (may bundle multiple files)
// ============================================================

export interface AssetItem {
  id: string
  name: string
  type: AssetType
  /** directory containing the asset */
  dirPath: string
  /** relative dir from root */
  relDirPath: string
  /** primary file (for display / sort) */
  mainFile: FileEntry
  /** all related files (e.g. _ske.json + _tex.json + _tex.png) */
  files: FileEntry[]
  /** total size across all files */
  totalSize: number
}

// ============================================================
// Directory tree node
// ============================================================

export interface DirNode {
  name: string
  path: string
  relPath: string
  children: DirNode[]
  totalAssets: number
}

// ============================================================
// Scan result
// ============================================================

export interface ScanResult {
  assets: AssetItem[]
  dirTree: DirNode
  rootPath: string
  totalFiles: number
  scannedAt: number
}

// ============================================================
// Search / filter state
// ============================================================

export interface FilterState {
  query: string
  /** Single-select type filter; null = show all */
  type: TypeFilter | null
  /** Extension sub-filter for image modes, e.g. 'png', 'jpg', '' = all */
  imageExt: string
  sortField: SortField
  sortOrder: SortOrder
}

// ============================================================
// Preview panel
// ============================================================

export interface PreviewState {
  visible: boolean
  asset: AssetItem | null
  /** index within filtered list (for prev/next navigation) */
  listIndex: number
}

// ============================================================
// History entry
// ============================================================

export interface HistoryEntry {
  path: string
  /** File System Access API stored handle — may be undefined if not supported */
  handle?: FileSystemDirectoryHandle
  lastOpened: number
}

// ============================================================
// Plist / atlas types
// ============================================================

export interface SpriteFrame {
  name: string
  x: number
  y: number
  width: number
  height: number
  /** original (un-trimmed) size */
  sourceWidth: number
  sourceHeight: number
  /** offset within original frame */
  offsetX: number
  offsetY: number
  rotated: boolean
}

export interface AtlasData {
  imageName: string
  imageWidth: number
  imageHeight: number
  frames: SpriteFrame[]
}

// ============================================================
// DragonBones types (minimal)
// ============================================================

export interface DragonBonesInfo {
  version: string
  name: string
  armatureNames: string[]
  animationNames: string[]
  frameRate: number
}

// ============================================================
// Spine types (minimal)
// ============================================================

export interface SpineInfo {
  version: string
  animationNames: string[]
  skinNames: string[]
}
