import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AssetItem } from '@/types'

export const usePreviewStore = defineStore('preview', () => {
  const visible    = ref(false)
  const asset      = ref<AssetItem | null>(null)
  const listIndex  = ref(-1)
  const openSerial = ref(0)   // incremented on every open(), forces watchers to re-run for same asset
  const forceImage = ref(false)

  function open(item: AssetItem, index = -1, opts: { forceImage?: boolean } = {}) {
    openSerial.value++
    asset.value      = item
    listIndex.value  = index
    visible.value    = true
    forceImage.value = opts.forceImage ?? false
  }

  function close() {
    visible.value = false
  }

  function clear() {
    visible.value    = false
    asset.value      = null
    listIndex.value  = -1
    forceImage.value = false
  }

  return { visible, asset, listIndex, openSerial, forceImage, open, close, clear }
})
