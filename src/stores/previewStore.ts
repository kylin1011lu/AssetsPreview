import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AssetItem } from '@/types'

export const usePreviewStore = defineStore('preview', () => {
  const visible    = ref(false)
  const asset      = ref<AssetItem | null>(null)
  const listIndex  = ref(-1)

  function open(item: AssetItem, index = -1) {
    asset.value     = item
    listIndex.value = index
    visible.value   = true
  }

  function close() {
    visible.value = false
  }

  function clear() {
    visible.value   = false
    asset.value     = null
    listIndex.value = -1
  }

  return { visible, asset, listIndex, open, close, clear }
})
