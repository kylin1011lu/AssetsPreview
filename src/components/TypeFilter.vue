<script setup lang="ts">
import { computed } from 'vue'
import type { TypeFilter } from '@/types'
import { useAssetStore } from '@/stores/assetStore'

const store = useAssetStore()

// Image-related filter buttons (shown first)
const IMAGE_FILTERS: { type: TypeFilter; label: string }[] = [
  { type: 'image-all', label: '全部图片' },
  { type: 'image',     label: '图片' },
]

// Other type filter buttons
const OTHER_FILTERS: { type: TypeFilter; label: string; cls: string }[] = [
  { type: 'audio',       label: '音频',         cls: 'tag-audio' },
  { type: 'atlas',       label: '图集',         cls: 'tag-atlas' },
  { type: 'dragonbones', label: 'DragonBones', cls: 'tag-dragonbones' },
  { type: 'spine',       label: 'Spine',       cls: 'tag-spine' },
  { type: 'ttf',         label: '字体',         cls: 'tag-font' },
  { type: 'fnt',         label: '位图字体',      cls: 'tag-font' },
]

const isImageMode = computed(() =>
  store.filter.type === 'image' || store.filter.type === 'image-all'
)

function selectType(type: TypeFilter) {
  store.setTypeFilter(store.filter.type === type ? null : type)
}

function selectExt(ext: string) {
  store.setImageExt(store.filter.imageExt === ext ? '' : ext)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center gap-1.5 flex-wrap">
      <span class="text-xs text-gray-500">类型：</span>

      <!-- Image filter buttons -->
      <button
        v-for="f in IMAGE_FILTERS"
        :key="f.type"
        class="tag-image cursor-pointer transition-opacity"
        :class="store.filter.type === f.type ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80'"
        @click="selectType(f.type)"
      >{{ f.label }}</button>

      <!-- Other type buttons -->
      <button
        v-for="f in OTHER_FILTERS"
        :key="f.type"
        :class="[f.cls, 'cursor-pointer transition-opacity',
          store.filter.type === f.type ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80']"
        @click="selectType(f.type)"
      >{{ f.label }}</button>

      <!-- Clear button -->
      <button
        v-if="store.filter.type !== null"
        class="text-xs text-gray-500 hover:text-gray-300 ml-1"
        @click="store.setTypeFilter(null)"
      >清除</button>
    </div>

    <!-- Image format sub-filter -->
    <div v-if="isImageMode && store.imageExts.length > 1" class="flex items-center gap-1.5 flex-wrap">
      <span class="text-xs text-gray-500">格式：</span>
      <button
        v-for="ext in store.imageExts"
        :key="ext"
        class="tag-image cursor-pointer transition-opacity text-[10px] px-1.5 py-0.5"
        :class="store.filter.imageExt === ext ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80'"
        @click="selectExt(ext)"
      >{{ ext.toUpperCase() }}</button>
    </div>
  </div>
</template>
