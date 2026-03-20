import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { AssetItem, AssetType, FilterState, SortField, SortOrder, DirNode, ScanResult } from '@/types'
import { AssetIndex } from '@/core/assetIndex'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

export const useAssetStore = defineStore('assets', () => {
  // ---- scan state ----
  const scanStatus   = ref<ScanStatus>('idle')
  const scanProgress = ref(0)   // files scanned
  const scanTotal    = ref(0)   // estimated total files
  const scanError    = ref<string | null>(null)
  const rootPath     = ref('')
  const rootDirName  = ref('')

  // ---- asset data ----
  const index = shallowRef<AssetIndex | null>(null)
  const dirTree = shallowRef<DirNode | null>(null)

  // ---- navigation ----
  const currentDirPath = ref('')  // relDirPath

  // ---- filter/sort state ----
  const filter = ref<FilterState>({
    query: '',
    types: [],
    sortField: 'name',
    sortOrder: 'asc',
  })

  // ---- computed: filtered asset list ----
  const filteredAssets = computed<AssetItem[]>(() => {
    if (!index.value) return []
    return index.value.query(filter.value, currentDirPath.value)
  })

  // ---- computed: type stats for current dir ----
  const typeStats = computed<Record<string, number>>(() => {
    if (!index.value) return {}
    return index.value.countByTypeInDir(currentDirPath.value)
  })

  // ---- actions ----

  function setScanProgress(scanned: number, total: number) {
    scanProgress.value = scanned
    scanTotal.value    = total
  }

  function setScanResult(result: ScanResult) {
    index.value    = new AssetIndex(result.assets)
    dirTree.value  = result.dirTree
    rootPath.value = result.rootPath
    rootDirName.value = result.rootPath.split(/[/\\]/).pop() || 'root'
    currentDirPath.value = ''
    scanStatus.value = 'done'
    scanError.value   = null
  }

  function setScanError(msg: string) {
    scanStatus.value = 'error'
    scanError.value   = msg
  }

  function reset() {
    scanStatus.value   = 'idle'
    scanProgress.value = 0
    scanTotal.value    = 0
    scanError.value    = null
    index.value        = null
    dirTree.value      = null
    rootPath.value     = ''
    currentDirPath.value = ''
    filter.value = { query: '', types: [], sortField: 'name', sortOrder: 'asc' }
  }

  function setCurrentDir(relDirPath: string) {
    currentDirPath.value = relDirPath
  }

  function setQuery(q: string) {
    filter.value = { ...filter.value, query: q }
  }

  function toggleTypeFilter(type: AssetType) {
    const types = filter.value.types
    if (types.includes(type)) {
      filter.value = { ...filter.value, types: types.filter(t => t !== type) }
    } else {
      filter.value = { ...filter.value, types: [...types, type] }
    }
  }

  function clearTypeFilter() {
    filter.value = { ...filter.value, types: [] }
  }

  function setSort(field: SortField, order?: SortOrder) {
    filter.value = {
      ...filter.value,
      sortField: field,
      sortOrder: order ?? (filter.value.sortField === field && filter.value.sortOrder === 'asc' ? 'desc' : 'asc'),
    }
  }

  return {
    scanStatus,
    scanProgress,
    scanTotal,
    scanError,
    rootPath,
    rootDirName,
    index,
    dirTree,
    currentDirPath,
    filter,
    filteredAssets,
    typeStats,
    setScanProgress,
    setScanResult,
    setScanError,
    reset,
    setCurrentDir,
    setQuery,
    toggleTypeFilter,
    clearTypeFilter,
    setSort,
  }
})
