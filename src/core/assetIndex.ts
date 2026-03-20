/**
 * assetIndex.ts
 *
 * Builds and queries the in-memory asset index.
 * Uses Fuse.js for fuzzy search.
 */

import Fuse from 'fuse.js'
import type { AssetItem, AssetType, FilterState, SortField, SortOrder } from '@/types'

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

    // Type filter
    if (filter.types.length > 0) {
      const typeSet = new Set<AssetType>(filter.types)
      results = results.filter(a => typeSet.has(a.type))
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
}
