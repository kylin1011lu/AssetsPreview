<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { AssetItem } from '@/types'
import { createObjectURL } from '@/core/fileReader'
import { usePreviewStore } from '@/stores/previewStore'
import { useAssetStore } from '@/stores/assetStore'

const preview = usePreviewStore()
const store   = useAssetStore()

// ---- Image loading ----
const imgUrl     = ref<string | null>(null)
const imgError   = ref(false)
const imgWidth   = ref(0)
const imgHeight  = ref(0)
let blobUrl: string | null = null

watch(
  [() => preview.asset, () => preview.forceImage],
  async ([asset]) => {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
    imgUrl.value   = null
    imgError.value = false
    imgWidth.value = 0
    imgHeight.value = 0
    if (!asset) return
    try {
      const fileToLoad = (preview.forceImage && asset.type !== 'image')
        ? (asset.files.find(f => f.name.endsWith('.png')) ?? asset.mainFile)
        : asset.mainFile
      const url = await createObjectURL(fileToLoad)
      blobUrl = url
      imgUrl.value = url
    } catch {
      imgError.value = true
    }
  },
  { immediate: true }
)

function onImgLoad(e: Event) {
  const img = e.target as HTMLImageElement
  imgWidth.value  = img.naturalWidth
  imgHeight.value = img.naturalHeight
}

// ---- Transform (zoom + pan) ----
const scale  = ref(1)
const transX = ref(0)
const transY = ref(0)

function resetTransform() {
  scale.value  = 1
  transX.value = 0
  transY.value = 0
}

watch(() => preview.asset, resetTransform)

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.min(4, Math.max(0.25, scale.value * delta))
}

let dragging = false
let dragStart = { x: 0, y: 0 }
let dragOrigin = { x: 0, y: 0 }

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  dragging = true
  dragStart = { x: e.clientX, y: e.clientY }
  dragOrigin = { x: transX.value, y: transY.value }
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return
  transX.value = dragOrigin.x + (e.clientX - dragStart.x)
  transY.value = dragOrigin.y + (e.clientY - dragStart.y)
}

function onMouseUp() { dragging = false }

// ---- Navigation ----
const assets = computed(() =>
  store.filteredAssets.filter(a => a.type === 'image')
)

function prev() {
  const idx = preview.listIndex
  const all = store.filteredAssets
  if (idx > 0) preview.open(all[idx - 1], idx - 1, { forceImage: preview.forceImage })
}

function next() {
  const idx = preview.listIndex
  const all = store.filteredAssets
  if (idx < all.length - 1) preview.open(all[idx + 1], idx + 1, { forceImage: preview.forceImage })
}

function hasPrev() { return preview.listIndex > 0 }
function hasNext() { return preview.listIndex < store.filteredAssets.length - 1 }

// ---- Keyboard ----
function onKey(e: KeyboardEvent) {
  if (!preview.visible || preview.asset?.type !== 'image') return
  if (e.key === 'ArrowLeft') { prev(); e.preventDefault() }
  if (e.key === 'ArrowRight') { next(); e.preventDefault() }
  if (e.key === 'Escape') { preview.close() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  if (blobUrl) URL.revokeObjectURL(blobUrl)
})

// ---- Helpers ----
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && (preview.asset?.type === 'image' || preview.forceImage)"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 92vw; height: 92vh; max-width: 1400px;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span class="text-xs text-gray-500">
                {{ imgWidth }} × {{ imgHeight }}
                &nbsp;·&nbsp;
                {{ formatSize(preview.asset?.totalSize ?? 0) }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <!-- Zoom controls -->
              <button class="btn-ghost text-xs px-2" @click="scale = Math.max(0.25, scale - 0.25)">−</button>
              <span class="text-xs text-gray-400 w-10 text-center">{{ Math.round(scale * 100) }}%</span>
              <button class="btn-ghost text-xs px-2" @click="scale = Math.min(4, scale + 0.25)">+</button>
              <button class="btn-ghost text-xs" @click="resetTransform">100%</button>
              <button class="btn-ghost" @click="preview.close">
                <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Image canvas -->
          <div
            class="relative overflow-hidden flex-1 min-h-0 cursor-grab select-none"
            :style="{
              backgroundImage: 'repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%)',
              backgroundSize: '16px 16px',
            }"
            @wheel.prevent="onWheel"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseUp"
          >
            <div
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
              :style="{
                transform: `translate(${transX}px, ${transY}px) scale(${scale})`,
                transformOrigin: 'center center',
              }"
            >
              <img
                v-if="imgUrl"
                :src="imgUrl"
                :alt="preview.asset?.name"
                class="max-w-none"
                style="image-rendering: pixelated"
                draggable="false"
                @load="onImgLoad"
              />
              <div v-else-if="imgError" class="text-red-400 text-sm">加载失败</div>
              <div v-else class="text-gray-500 text-sm">加载中...</div>
            </div>
          </div>

          <!-- Navigation footer -->
          <div class="flex items-center justify-between px-4 py-2 border-t border-gray-700 flex-shrink-0">
            <button
              class="btn-ghost"
              :disabled="!hasPrev()"
              @click="prev"
            >← 上一个</button>
            <span class="text-xs text-gray-500">
              {{ preview.listIndex + 1 }} / {{ store.filteredAssets.length }}
            </span>
            <button
              class="btn-ghost"
              :disabled="!hasNext()"
              @click="next"
            >下一个 →</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
