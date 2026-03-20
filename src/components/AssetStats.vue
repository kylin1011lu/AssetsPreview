<script setup lang="ts">
import { computed } from 'vue'
import { useAssetStore } from '@/stores/assetStore'
import type { AssetType } from '@/types'

const store = useAssetStore()

const STATS_CONFIG: { type: AssetType; label: string; cls: string }[] = [
  { type: 'image',       label: '图片',         cls: 'text-blue-400' },
  { type: 'audio',       label: '音频',         cls: 'text-green-400' },
  { type: 'atlas',       label: '图集',         cls: 'text-yellow-400' },
  { type: 'dragonbones', label: 'DragonBones', cls: 'text-orange-400' },
  { type: 'spine',       label: 'Spine',       cls: 'text-red-400' },
  { type: 'ttf',         label: '字体',         cls: 'text-purple-400' },
  { type: 'fnt',         label: '位图字体',      cls: 'text-purple-300' },
]

const stats = computed(() => store.typeStats)
const total = computed(() => Object.values(stats.value).reduce((a, b) => a + b, 0))

const items = computed(() =>
  STATS_CONFIG
    .map(c => ({ ...c, count: stats.value[c.type] ?? 0 }))
    .filter(c => c.count > 0)
)
</script>

<template>
  <div class="flex items-center gap-3 text-xs overflow-x-auto">
    <span class="text-gray-400 flex-shrink-0">
      共 <strong class="text-gray-200">{{ total }}</strong> 个资源
    </span>
    <span
      v-for="item in items"
      :key="item.type"
      :class="['flex-shrink-0', item.cls]"
    >
      {{ item.label }} {{ item.count }}
    </span>
  </div>
</template>
