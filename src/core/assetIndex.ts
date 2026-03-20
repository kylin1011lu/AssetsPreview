/**
 * assetIndex.ts
 *
 * Builds and queries the in-memory asset index.
 * Uses Fuse.js for fuzzy search.
 */

import Fuse from 'fuse.js'
import type { AssetItem, AssetType, TypeFilter, FilterState, SortField, SortOrder } from '@/types'

// Types counted as "all images" when 'image-all' filter is active
const IMAGE_ALL_TYPES = new Set<AssetType>(['image', 'atlas', 'dragonbones', 'spine', 'fnt'])

export class AssetIndex {
  private assets: AssetItem[] = []
  private byPath = new Map<string, AssetItem>()
  private byDir  = new Map<string, AssetItem[]>()
  private fuse!: Fuse<AssetItem>

  constructor(assets: AssetItem[]) {
    this.rebuild(assets)
  }

  rebuild(assets: AssetItem[]): void {
    this.assets = assets
    this.byPath.clear()
    this.byDir.clear()

    for (const a of assets) {
      this.byPath.set(a.mainFile.path, a)
      const dir = a.relDirPath || ''
      if (!this.byDir.has(dir)) this.byDir.set(dir, [])
      this.byDir.get(dir)!.push(a)
    }

    this.fuse = new Fuse(assets, {
      keys: ['name', 'mainFile.relPath'],
      threshold: 0.35,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 1,
      ignoreLocation: true,
    })
  }

  // ---------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------

  getAll(): AssetItem[] {
    return this.assets
  }

  getByPath(path: string): AssetItem | undefined {
    return this.byPath.get(path)
  }

  /**
   * Returns all assets whose relDirPath starts with the given prefix.
   * Pass '' to get all assets.
   */
  getByDirPrefix(relDirPath: string): AssetItem[] {
    if (relDirPath === '') return this.assets
    return this.assets.filter(a =>
      a.relDirPath === relDirPath ||
      a.relDirPath.startsWith(relDirPath + '/')
    )
  }

  /**
   * Main query method — applies search, type filter, and sorting.
   */
  query(filter: FilterState, relDirPath = ''): AssetItem[] {
    let results: AssetItem[]

    if (filter.query.trim()) {
      // Fuse search first, then filter by dir
      const fuseResults = this.fuse.search(filter.query)
      results = fuseResults.map(r => r.item)
      if (relDirPath) {
        results = results.filter(a =>
          a.relDirPath === relDirPath ||
          a.relDirPath.startsWith(relDirPath + '/')
        )
      }
    } else {
      results = this.getByDirPrefix(relDirPath)
    }

    // Type filter (single-select)
    if (filter.type !== null) {
      if (filter.type === 'image-all') {
        results = results.filter(a => IMAGE_ALL_TYPES.has(a.type))
      } else {
        results = results.filter(a => a.type === filter.type)
      }
    }

    // Image extension sub-filter (applies to 'image' typed assets only)
    if (filter.imageExt && (filter.type === 'image' || filter.type === 'image-all')) {
      const ext = '.' + filter.imageExt.toLowerCase()
      results = results.filter(a => {
        if (a.type !== 'image') return true  // keep non-image assets in 'image-all' mode
        return a.mainFile.name.toLowerCase().endsWith(ext)
      })
    }

    // Sort
    results = this.sort(results, filter.sortField, filter.sortOrder)

    return results
  }

  private sort(items: AssetItem[], field: SortField, order: SortOrder): AssetItem[] {
    const sorted = [...items]
    sorted.sort((a, b) => {
      let cmp = 0
      if (field === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (field === 'size') {
        cmp = a.totalSize - b.totalSize
      } else if (field === 'mtime') {
        cmp = a.mainFile.lastModified - b.mainFile.lastModified
      }
      return order === 'asc' ? cmp : -cmp
    })
    return sorted
  }

  // ---------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------

  countByType(): Record<AssetType, number> {
    const counts: Record<string, number> = {}
    for (const a of this.assets) {
      counts[a.type] = (counts[a.type] ?? 0) + 1
    }
    return counts as Record<AssetType, number>
  }

  countByTypeInDir(relDirPath: string): Record<AssetType, number> {
    const items = this.getByDirPrefix(relDirPath)
    const counts: Record<string, number> = {}
    for (const a of items) {
      counts[a.type] = (counts[a.type] ?? 0) + 1
    }
    return counts as Record<AssetType, number>
  }

  /** Returns sorted list of image file extensions for 'image' typed assets in the given dir. */
  getImageExts(relDirPath = ''): string[] {
    const items = this.getByDirPrefix(relDirPath).filter(a => a.type === 'image')
    const exts = new Set<string>()
    for (const a of items) {
      const dot = a.mainFile.name.lastIndexOf('.')
      if (dot >= 0) exts.add(a.mainFile.name.slice(dot + 1).toLowerCase())
    }
    return [...exts].sort()
  }
}
