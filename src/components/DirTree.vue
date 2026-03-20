<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useAssetStore } from '@/stores/assetStore'
import { usePreviewStore } from '@/stores/previewStore'
import DirTreeNode from './DirTreeNode.vue'

const store = useAssetStore()
const preview = usePreviewStore()
const tree = computed(() => store.dirTree)
const rootRowRef = ref<HTMLElement | null>(null)
const rootHasActiveAsset = computed(() => preview.asset?.relDirPath === '')

watch(
  () => preview.asset?.relDirPath,
  (relDirPath) => {
    if (relDirPath === '') {
      nextTick(() => rootRowRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    }
  }
)
</script>

<template>
  <div class="overflow-y-auto overflow-x-hidden py-2">
    <template v-if="tree">
      <!-- Root node (show all) -->
      <div
        ref="rootRowRef"
        class="flex items-center gap-1 py-0.5 px-2 rounded cursor-pointer text-sm select-none"
        :class="[
          store.currentDirPath === ''
            ? 'bg-blue-600/20 text-blue-300'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        ]"
        @click="store.setCurrentDir('')"
      >
        <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
        </svg>
        <span class="flex-1 truncate font-medium">{{ store.rootDirName }}</span>
        <span class="text-xs text-gray-500">{{ tree.totalAssets }}</span>
        <span v-if="rootHasActiveAsset" class="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
      </div>

      <DirTreeNode
        v-for="child in tree.children"
        :key="child.path"
        :node="child"
        :depth="1"
      />
    </template>

    <div v-else class="px-4 py-2 text-sm text-gray-600 italic">
      未选择文件夹
    </div>
  </div>
</template>
