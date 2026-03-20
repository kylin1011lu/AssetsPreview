<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { AssetItem, ThumbnailSize } from '@/types'
import { useAssetStore } from '@/stores/assetStore'
import { usePreviewStore } from '@/stores/previewStore'
import AssetCard from './AssetCard.vue'

const props = defineProps<{
  assets: AssetItem[]
  thumbSize?: ThumbnailSize
}>()

const store = useAssetStore()
const preview = usePreviewStore()
const thumbSize = computed<ThumbnailSize>(() => props.thumbSize ?? 120)

// ---- Virtual scroll implementation ----
// We use a simple CSS grid with IntersectionObserver-based lazy loading
// via AssetCard internals. vue-virtual-scroller requires registration,
// so we implement a lightweight windowed scroller here.

const containerRef = ref<HTMLDivElement | null>(null)
const scrollTop   = ref(0)
const viewHeight  = ref(600)

// Gap between cards
const GAP = 8

// How many cols fit
const colCount = computed(() => {
  if (!containerRef.value) return 4
  const w = containerRef.value.clientWidth
  const cardW = thumbSize.value + GAP
  return Math.max(1, Math.floor(w / cardW))
})

const rowHeight  = computed(() => thumbSize.value + 52 + GAP) // card + info + gap
const totalRows  = computed(() => Math.ceil(props.assets.length / colCount.value))
const totalHeight = computed(() => totalRows.value * rowHeight.value)

// Render window: add 2 row buffer above/below
const BUFFER_ROWS = 2
const firstRow = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - BUFFER_ROWS))
const lastRow  = computed(() => Math.min(totalRows.value - 1, firstRow.value + Math.ceil(viewHeight.value / rowHeight.value) + BUFFER_ROWS * 2))

const visibleItems = computed(() => {
  const start = firstRow.value * colCount.value
  const end   = Math.min(props.assets.length, (lastRow.value + 1) * colCount.value)
  return props.assets.slice(start, end).map((a, i) => ({ asset: a, index: start + i }))
})

const offsetTop = computed(() => firstRow.value * rowHeight.value)

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLDivElement).scrollTop
}

// Keyboard navigation
function handleKey(e: KeyboardEvent) {
  if (!preview.visible) return
  const assets = props.assets
  const idx = preview.listIndex
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (idx < assets.length - 1) preview.open(assets[idx + 1], idx + 1)
    e.preventDefault()
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (idx > 0) preview.open(assets[idx - 1], idx - 1)
    e.preventDefault()
  } else if (e.key === 'Escape') {
    preview.close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKey)
  if (containerRef.value) {
    viewHeight.value = containerRef.value.clientHeight
    const ro = new ResizeObserver(() => {
      viewHeight.value = containerRef.value?.clientHeight ?? 600
    })
    ro.observe(containerRef.value)
  }
})
onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<template>
  <div
    ref="containerRef"
    class="overflow-y-auto flex-1"
    @scroll="onScroll"
  >
    <div v-if="assets.length === 0" class="flex items-center justify-center h-full text-gray-500 text-sm">
      无资源
    </div>

    <!-- Virtual scroll container -->
    <div v-else :style="{ height: `${totalHeight}px`, position: 'relative' }">
      <div
        :style="{
          position: 'absolute',
          top: `${offsetTop}px`,
          left: 0,
          right: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${GAP}px`,
          padding: `${GAP}px`,
        }"
      >
        <AssetCard
          v-for="item in visibleItems"
          :key="item.asset.id"
          :asset="item.asset"
          :size="thumbSize"
          :selected="preview.asset?.id === item.asset.id"
          @click="(a) => preview.open(a, item.index)"
        />
      </div>
    </div>
  </div>
</template>
