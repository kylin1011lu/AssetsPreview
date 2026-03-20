<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DirNode } from '@/types'
import { useAssetStore } from '@/stores/assetStore'

const props = defineProps<{
  node: DirNode
  depth?: number
}>()

const store = useAssetStore()
const depth = computed(() => props.depth ?? 0)
const expanded = ref(depth.value < 2)
const isActive = computed(() => store.currentDirPath === props.node.relPath)
const hasChildren = computed(() => props.node.children.length > 0)

function toggle() {
  if (hasChildren.value) expanded.value = !expanded.value
  store.setCurrentDir(props.node.relPath)
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1 py-0.5 px-2 rounded cursor-pointer text-sm select-none group"
      :class="[
        isActive
          ? 'bg-blue-600/20 text-blue-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
      ]"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="toggle"
    >
      <!-- Expand chevron -->
      <svg
        class="w-3 h-3 flex-shrink-0 transition-transform"
        :class="[expanded ? 'rotate-90' : '', hasChildren ? '' : 'opacity-0']"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
      </svg>

      <!-- Folder icon -->
      <svg class="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>

      <!-- Name -->
      <span class="flex-1 truncate">{{ node.name }}</span>

      <!-- Count badge -->
      <span
        v-if="node.totalAssets > 0"
        class="text-xs text-gray-500 group-hover:text-gray-400"
      >{{ node.totalAssets }}</span>
    </div>

    <!-- Children -->
    <div v-if="expanded && hasChildren">
      <DirTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
