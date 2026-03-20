<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { AssetItem, AssetType, ThumbnailSize } from '@/types'
import { createObjectURL } from '@/core/fileReader'

// ---- Context menu ----
const ctxVisible = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const copyFeedback = ref(false)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxVisible.value = true
  // Adjust if near viewport edge
  const menuW = 180
  const menuH = 90
  if (ctxX.value + menuW > window.innerWidth)  ctxX.value -= menuW
  if (ctxY.value + menuH > window.innerHeight) ctxY.value -= menuH
}

function closeCtx() { ctxVisible.value = false }

async function copyRelPath() {
  const path = props.asset.relDirPath
    ? `${props.asset.relDirPath}/${props.asset.name}`
    : props.asset.name
  try {
    await navigator.clipboard.writeText(path)
    copyFeedback.value = true
    setTimeout(() => { copyFeedback.value = false }, 1200)
  } catch { /* clipboard API not available */ }
  closeCtx()
}

async function copyFileName() {
  try { await navigator.clipboard.writeText(props.asset.name) } catch {}
  closeCtx()
}

// Close context menu on outside click / escape
function onDocClick(e: MouseEvent) {
  if (!ctxVisible.value) return
  closeCtx()
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCtx()
}

const props = defineProps<{
  asset: AssetItem
  size: ThumbnailSize
  selected?: boolean
}>()

const emit = defineEmits<{
  click: [asset: AssetItem]
}>()

// ---- type label ----
const TYPE_LABEL: Record<AssetType, string> = {
  image: '图片',
  audio: '音频',
  atlas: '图集',
  dragonbones: 'DragonBones',
  spine: 'Spine',
  ttf: '字体',
  fnt: '位图字体',
}

const TYPE_CLASS: Record<AssetType, string> = {
  image: 'tag-image',
  audio: 'tag-audio',
  atlas: 'tag-atlas',
  dragonbones: 'tag-dragonbones',
  spine: 'tag-spine',
  ttf: 'tag-font',
  fnt: 'tag-font',
}

// ---- thumbnail ----
const thumbUrl = ref<string | null>(null)
const thumbError = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null
let objectUrl: string | null = null

function loadThumb() {
  if (thumbUrl.value || thumbError.value) return
  const type = props.asset.type
  // Only load thumbnails for image-based types
  if (!['image', 'atlas', 'dragonbones', 'spine', 'fnt'].includes(type)) return

  const thumbFile =
    type === 'image'
      ? props.asset.mainFile
      : props.asset.files.find(f => f.name.endsWith('.png')) ?? null

  if (!thumbFile) return

  createObjectURL(thumbFile)
    .then(url => {
      objectUrl = url
      thumbUrl.value = url
    })
    .catch(() => { thumbError.value = true })
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onDocKeydown)
  if (!containerRef.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        loadThumb()
        observer?.disconnect()
      }
    },
    { rootMargin: '200px' }
  )
  observer.observe(containerRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onDocKeydown)
})

// ---- audio icon placeholder ----
const AUDIO_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 text-green-400"><path d="M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-2c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>`

// Format bytes
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

const cardStyle = computed(() => ({
  width: `${props.size}px`,
}))

const thumbStyle = computed(() => ({
  height: `${props.size}px`,
}))
</script>

<template>
  <div
    ref="containerRef"
    class="flex flex-col rounded-lg overflow-hidden cursor-pointer border transition-all"
    :class="[
      selected
        ? 'border-blue-500 bg-gray-750'
        : 'border-gray-700 bg-gray-800 hover:border-gray-500 hover:bg-gray-750',
    ]"
    :style="cardStyle"
    @click="emit('click', asset)"
    @contextmenu="onContextMenu"
  >
    <!-- Thumbnail area -->
    <div
      class="relative flex items-center justify-center bg-gray-900 overflow-hidden flex-shrink-0"
      :style="thumbStyle"
    >
      <!-- Checkerboard for images -->
      <div
        v-if="['image', 'atlas', 'fnt'].includes(asset.type)"
        class="absolute inset-0"
        style="background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 12px 12px;"
      />

      <!-- Image thumbnail -->
      <img
        v-if="thumbUrl"
        :src="thumbUrl"
        :alt="asset.name"
        class="relative max-w-full max-h-full object-contain"
        style="image-rendering: pixelated"
        loading="lazy"
      />

      <!-- Audio placeholder -->
      <div
        v-else-if="asset.type === 'audio'"
        class="relative flex flex-col items-center gap-1"
        v-html="AUDIO_ICON"
      />

      <!-- TTF font placeholder -->
      <div
        v-else-if="asset.type === 'ttf'"
        class="relative text-purple-300 text-3xl font-bold select-none"
      >Aa</div>

      <!-- Dragonbones placeholder -->
      <div
        v-else-if="asset.type === 'dragonbones'"
        class="relative text-orange-300 text-xs text-center px-1"
      >
        <div class="text-2xl mb-1">🦴</div>
        <div>DragonBones</div>
      </div>

      <!-- Spine placeholder -->
      <div
        v-else-if="asset.type === 'spine'"
        class="relative text-red-300 text-xs text-center px-1"
      >
        <div class="text-2xl mb-1">⬡</div>
        <div>Spine</div>
      </div>

      <!-- Error / loading placeholder -->
      <div v-else class="relative text-gray-600">
        <svg class="w-8 h-8" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
      </div>
    </div>

    <!-- Info area -->
    <div class="px-1.5 py-1 flex flex-col gap-0.5 min-w-0">
      <p class="text-xs text-gray-200 truncate font-medium" :title="asset.name">{{ asset.name }}</p>
      <div class="flex items-center justify-between gap-1">
        <span :class="TYPE_CLASS[asset.type]">{{ TYPE_LABEL[asset.type] }}</span>
        <span class="text-xs text-gray-500">{{ formatSize(asset.totalSize) }}</span>
      </div>
    </div>
  </div>

  <!-- Context menu -->
  <Teleport to="body">
    <div
      v-if="ctxVisible"
      class="fixed z-[200] py-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[160px] text-sm"
      :style="{ left: ctxX + 'px', top: ctxY + 'px' }"
      @click.stop
    >
      <button
        class="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        @click="copyRelPath"
      >
        <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
        </svg>
        {{ copyFeedback ? '已复制！' : '复制相对路径' }}
      </button>
      <button
        class="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        @click="copyFileName"
      >
        <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/>
        </svg>
        复制文件名
      </button>
    </div>
  </Teleport>
</template>
