import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AssetItem } from '@/types'

export const usePreviewStore = defineStore('preview', () => {
  const visible    = ref(false)
  const asset      = ref<AssetItem | null>(null)
  const listIndex  = ref(-1)
  const openSerial = ref(0)   // incremented on every open(), forces watchers to re-run for same asset

  function open(item: AssetItem, index = -1) {
    openSerial.value++
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

  return { visible, asset, listIndex, openSerial, open, close, clear }
})
