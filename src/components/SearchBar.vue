<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAssetStore } from '@/stores/assetStore'

const store = useAssetStore()
const localQuery = ref(store.filter.query)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(localQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.setQuery(val)
  }, 300)
})

function clear() {
  localQuery.value = ''
  store.setQuery('')
}
</script>

<template>
  <div class="relative flex items-center">
    <svg
      class="absolute left-2.5 w-4 h-4 text-gray-500 pointer-events-none"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
    </svg>
    <input
      v-model="localQuery"
      type="text"
      placeholder="搜索资源名称..."
      class="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-600 pl-8 pr-8 py-1.5 focus:outline-none focus:border-blue-500"
    />
    <button
      v-if="localQuery"
      class="absolute right-2 text-gray-500 hover:text-gray-300"
      @click="clear"
    >
      <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
    </button>
  </div>
</template>
