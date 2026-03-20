/**
 * scanner.ts
 *
 * Scans a list of FileEntry objects and classifies them into AssetItem objects.
 *
 * Recognition priority (highest first):
 *  1. DragonBones triplet: *_ske.json + *_tex.json + *_tex.png
 *  2. Spine triplet:       *.atlas + same-base *.json (with skeleton field) + *.png
 *  3. Plist atlas:         *.plist + same-name *.png
 *  4. FNT bitmap font:     *.fnt + associated *.png
 *  5. TTF fonts:           .ttf / .otf / .woff / .woff2
 *  6. Audio:               .mp3 / .ogg / .wav
 *  7. Images:              remaining .png / .jpg / .jpeg / .webp
 *
 * Files consumed by higher-priority rules are NOT listed separately.
 */

import type { FileEntry, AssetItem, AssetType, DirNode, ScanResult } from '@/types'
import { readFileAsText } from './fileReader'

// ---------------------------------------------------------------
// Extension sets
// ---------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav'])
const TTF_EXTS   = new Set(['.ttf', '.otf', '.woff', '.woff2'])

// Files to silently skip
const SKIP_EXTS  = new Set([
  '.meta', '.js', '.ts', '.tsx', '.jsx',
  '.prefab', '.anim', '.fire', '.scene',
  '.ts', '.d.ts',
])

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

let idCounter = 0
function nextId(): string {
  return `asset_${++idCounter}`
}

function ext(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function baseName(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(0, i) : name
}

// ---------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------

export interface ScanOptions {
  /** Called for each file processed */
  onProgress?: (scanned: number, total: number) => void
}

export async function scanEntries(
  entries: FileEntry[],
  rootPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const { onProgress } = options
  const total = entries.length

  // Step 1: Filter out skipped extensions
  const filtered = entries.filter(e => !SKIP_EXTS.has(ext(e.name)))

  // Step 2: Group files by directory
  const byDir = new Map<string, FileEntry[]>()
  for (const entry of filtered) {
    const dir = entry.dirPath
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir)!.push(entry)
  }

  const assets: AssetItem[] = []
  const consumed = new Set<string>() // path keys of files already "used"

  let scanned = 0
  const tick = (n = 1) => {
    scanned += n
    onProgress?.(scanned, total)
  }

  // Step 3: Per-directory recognition
  for (const [, dirFiles] of byDir) {
    // Build lookup maps for this directory
    const byName = new Map<string, FileEntry>()  // filename → entry
    const byBase = new Map<string, FileEntry[]>()  // basename → entries[]

    for (const f of dirFiles) {
      byName.set(f.name, f)
      const b = baseName(f.name)
      if (!byBase.has(b)) byBase.set(b, [])
      byBase.get(b)!.push(f)
    }

    // ---- 1. DragonBones triplets ----
    for (const f of dirFiles) {
      if (!f.name.endsWith('_ske.json')) continue
      const prefix = f.name.slice(0, -'_ske.json'.length)
      const texJson = byName.get(`${prefix}_tex.json`)
      const texPng  = byName.get(`${prefix}_tex.png`)
      if (!texJson || !texPng) continue

      appendAsset(assets, consumed, {
        id: nextId(),
        name: prefix,
        type: 'dragonbones',
        dirPath: f.dirPath,
        relDirPath: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '',
        mainFile: f,
        files: [f, texJson, texPng],
        totalSize: f.size + texJson.size + texPng.size,
      })
      tick(3)
    }

    // ---- 2. Spine triplets ----
    for (const f of dirFiles) {
      if (ext(f.name) !== '.atlas') continue
      if (consumed.has(f.path)) continue
      const base = baseName(f.name)
      const jsonFile = byName.get(`${base}.json`) || byName.get(`${base}.json`)
      if (!jsonFile || consumed.has(jsonFile.path)) continue

      // Verify it's actually a Spine JSON by reading first 256 bytes
      let isSpine = false
      try {
        const text = await readFileAsText(jsonFile)
        isSpine = text.includes('"skeleton"') && text.includes('"spine"')
      } catch { /* skip */ }
      if (!isSpine) continue

      // Find associated png (same base name)
      const pngFile = byName.get(`${base}.png`)
      const files: FileEntry[] = [jsonFile, f]
      if (pngFile && !consumed.has(pngFile.path)) files.push(pngFile)

      appendAsset(assets, consumed, {
        id: nextId(),
        name: base,
        type: 'spine',
        dirPath: f.dirPath,
        relDirPath: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '',
        mainFile: jsonFile,
        files,
        totalSize: files.reduce((s, x) => s + x.size, 0),
      })
      tick(files.length)
    }

    // ---- 3. Plist atlas ----
    for (const f of dirFiles) {
      if (ext(f.name) !== '.plist') continue
      if (consumed.has(f.path)) continue
      const base = baseName(f.name)
      const png = byName.get(`${base}.png`)
      const files: FileEntry[] = [f]
      if (png && !consumed.has(png.path)) files.push(png)

      appendAsset(assets, consumed, {
        id: nextId(),
        name: base,
        type: 'atlas',
        dirPath: f.dirPath,
        relDirPath: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '',
        mainFile: f,
        files,
        totalSize: files.reduce((s, x) => s + x.size, 0),
      })
      tick(files.length)
    }

    // ---- 4. FNT bitmap fonts ----
    for (const f of dirFiles) {
      if (ext(f.name) !== '.fnt') continue
      if (consumed.has(f.path)) continue
      const fntText = await readFntHeader(f)
      const pngName = extractFntPageFile(fntText)
      const files: FileEntry[] = [f]
      if (pngName) {
        const png = byName.get(pngName)
        if (png && !consumed.has(png.path)) files.push(png)
      }

      appendAsset(assets, consumed, {
        id: nextId(),
        name: baseName(f.name),
        type: 'fnt',
        dirPath: f.dirPath,
        relDirPath: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '',
        mainFile: f,
        files,
        totalSize: files.reduce((s, x) => s + x.size, 0),
      })
      tick(files.length)
    }

    // ---- 5-7. Remaining files by extension ----
    for (const f of dirFiles) {
      if (consumed.has(f.path)) continue
      const e = ext(f.name)
      let type: AssetType | null = null
      if (TTF_EXTS.has(e)) type = 'ttf'
      else if (AUDIO_EXTS.has(e)) type = 'audio'
      else if (IMAGE_EXTS.has(e)) type = 'image'
      if (!type) { tick(); continue }

      appendAsset(assets, consumed, {
        id: nextId(),
        name: baseName(f.name),
        type,
        dirPath: f.dirPath,
        relDirPath: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '',
        mainFile: f,
        files: [f],
        totalSize: f.size,
      })
      tick()
    }
  }

  // Step 4: Build directory tree
  const dirTree = buildDirTree(assets, rootPath)

  return {
    assets,
    dirTree,
    rootPath,
    totalFiles: entries.length,
    scannedAt: Date.now(),
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function appendAsset(
  assets: AssetItem[],
  consumed: Set<string>,
  item: AssetItem
): void {
  for (const f of item.files) consumed.add(f.path)
  assets.push(item)
}

async function readFntHeader(entry: FileEntry): Promise<string> {
  try {
    // Read only first 1 KB to extract page file name
    const blob = entry.file
      ? entry.file.slice(0, 1024)
      : (await entry.handle!.getFile()).slice(0, 1024)
    return blob.text()
  } catch {
    return ''
  }
}

function extractFntPageFile(fntText: string): string | null {
  // BMFont text format: `page id=0 file="texture.png"`
  const m = fntText.match(/file="([^"]+)"/)
  if (m) return m[1]
  return null
}

// ---------------------------------------------------------------
// Directory tree builder
// ---------------------------------------------------------------

function buildDirTree(assets: AssetItem[], rootPath: string): DirNode {
  // Count assets per directory (including descendants for display)
  const directCount = new Map<string, number>()
  for (const a of assets) {
    const d = a.relDirPath || ''
    directCount.set(d, (directCount.get(d) ?? 0) + 1)
  }

  // Collect all unique rel-dir paths
  const allDirs = new Set<string>()
  allDirs.add('')
  for (const a of assets) {
    let p = a.relDirPath || ''
    while (p) {
      allDirs.add(p)
      const lastSlash = p.lastIndexOf('/')
      p = lastSlash >= 0 ? p.slice(0, lastSlash) : ''
    }
  }

  // Total count = all assets in subtree
  const totalByDir = new Map<string, number>()
  for (const dir of allDirs) {
    let count = 0
    for (const [d, c] of directCount) {
      if (d === dir || d.startsWith(dir ? `${dir}/` : '')) count += c
    }
    totalByDir.set(dir, count)
  }

  function buildNode(relPath: string): DirNode {
    const name = relPath ? relPath.split('/').pop()! : (rootPath.split(/[/\\]/).pop() || 'root')
    const children: DirNode[] = []
    for (const d of allDirs) {
      const parent = d.includes('/')
        ? d.slice(0, d.lastIndexOf('/'))
        : d === '' ? null : ''
      if (parent === relPath) {
        children.push(buildNode(d))
      }
    }
    children.sort((a, b) => a.name.localeCompare(b.name))
    return {
      name,
      path: relPath,
      relPath,
      children,
      totalAssets: totalByDir.get(relPath) ?? 0,
    }
  }

  return buildNode('')
}
