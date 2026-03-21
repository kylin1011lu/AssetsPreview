import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { AssetItem, AssetType, TypeFilter, FilterState, SortField, SortOrder, DirNode, ScanResult } from '@/types'
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

  // ---- root path prefix (user-set absolute parent, persisted per folder name) ----
  const rootPrefix = ref('')

  function _prefixKey(name: string) { return `ap_prefix_${name}` }

  function setRootPrefix(prefix: string) {
    rootPrefix.value = prefix.replace(/[\/\\]+$/, '')
    if (rootDirName.value) localStorage.setItem(_prefixKey(rootDirName.value), rootPrefix.value)
  }

  // ---- filter/sort state ----
  const filter = ref<FilterState>({
    query: '',
    type: null,
    imageExt: '',
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

  // ---- computed: available image extensions in current dir ----
  const imageExts = computed<string[]>(() => {
    if (!index.value) return []
    return index.value.getImageExts(currentDirPath.value)
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
    // Auto-load saved prefix for this folder
    rootPrefix.value = localStorage.getItem(_prefixKey(rootDirName.value)) ?? ''
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
    rootDirName.value  = ''
    rootPrefix.value   = ''
    currentDirPath.value = ''
    filter.value = { query: '', type: null, imageExt: '', sortField: 'name', sortOrder: 'asc' }
  }

  function setCurrentDir(relDirPath: string) {
    currentDirPath.value = relDirPath
  }

  function setQuery(q: string) {
    filter.value = { ...filter.value, query: q }
  }

  function setTypeFilter(type: TypeFilter | null) {
    filter.value = { ...filter.value, type, imageExt: '' }
  }

  function setImageExt(ext: string) {
    filter.value = { ...filter.value, imageExt: ext }
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
    rootPrefix,
    index,
    dirTree,
    currentDirPath,
    filter,
    filteredAssets,
    typeStats,
    imageExts,
    setScanProgress,
    setScanResult,
    setScanError,
    reset,
    setCurrentDir,
    setRootPrefix,
    setQuery,
    setTypeFilter,
    setImageExt,
    setSort,
  }
})
