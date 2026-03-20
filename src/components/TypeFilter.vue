<script setup lang="ts">
import type { AssetType } from '@/types'
import { useAssetStore } from '@/stores/assetStore'

const store = useAssetStore()

const FILTERS: { type: AssetType; label: string; cls: string }[] = [
  { type: 'image',       label: '图片',         cls: 'tag-image' },
  { type: 'audio',       label: '音频',         cls: 'tag-audio' },
  { type: 'atlas',       label: '图集',         cls: 'tag-atlas' },
  { type: 'dragonbones', label: 'DragonBones', cls: 'tag-dragonbones' },
  { type: 'spine',       label: 'Spine',       cls: 'tag-spine' },
  { type: 'ttf',         label: '字体',         cls: 'tag-font' },
  { type: 'fnt',         label: '位图字体',      cls: 'tag-font' },
]
</script>

<template>
  <div class="flex items-center gap-1.5 flex-wrap">
    <span class="text-xs text-gray-500">类型：</span>
    <button
      v-for="f in FILTERS"
      :key="f.type"
      :class="[
        f.cls,
        'cursor-pointer transition-opacity',
        store.filter.types.includes(f.type) ? 'opacity-100 ring-1 ring-current' : 'opacity-50 hover:opacity-80',
      ]"
      @click="store.toggleTypeFilter(f.type)"
    >
      {{ f.label }}
    </button>
    <button
      v-if="store.filter.types.length > 0"
      class="text-xs text-gray-500 hover:text-gray-300 ml-1"
      @click="store.clearTypeFilter"
    >
      清除
    </button>
  </div>
</template>
