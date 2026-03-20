<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, createObjectURL } from '@/core/fileReader'
import { parsePlist } from '@/core/parsers/plistParser'
import type { SpriteFrame, AtlasData } from '@/types'

const preview = usePreviewStore()

// ---- State ----
const loading     = ref(false)
const error       = ref('')
const atlasData   = ref<AtlasData | null>(null)
const atlasImgUrl = ref<string | null>(null)
const selectedFrame = ref<SpriteFrame | null>(null)
const searchQuery = ref('')
const atlasImgEl  = ref<HTMLImageElement | null>(null)
let blobUrl: string | null = null

// ---- Load plist ----
watch(
  () => preview.asset,
  async (asset) => {
    cleanup()
    if (!asset || asset.type !== 'atlas') return
    loading.value = true
    error.value   = ''
    atlasData.value     = null
    atlasImgUrl.value   = null
    selectedFrame.value = null
    searchQuery.value   = ''
    try {
      // Find the plist file
      const plistFile = asset.files.find(f => f.name.endsWith('.plist'))
      const pngFile   = asset.files.find(f => f.name.endsWith('.png'))
      if (!plistFile) throw new Error('找不到 .plist 文件')

      const text = await readFileAsText(plistFile)
      const data = parsePlist(text, pngFile?.name || 'texture.png')
      atlasData.value = data

      if (pngFile) {
        blobUrl = await createObjectURL(pngFile)
        atlasImgUrl.value = blobUrl
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function cleanup() {
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
}
onUnmounted(cleanup)

// ---- Filtered frames ----
const filteredFrames = computed(() => {
  if (!atlasData.value) return []
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return atlasData.value.frames
  return atlasData.value.frames.filter(f => f.name.toLowerCase().includes(q))
})

// ---- Highlight overlay on atlas ----
const highlightStyle = computed(() => {
  if (!selectedFrame.value || !atlasImgEl.value || !atlasData.value?.imageWidth) return null
  const sf = selectedFrame.value
  const natW = atlasData.value.imageWidth || atlasImgEl.value.naturalWidth
  const natH = atlasData.value.imageHeight || atlasImgEl.value.naturalHeight
  const rect = atlasImgEl.value.getBoundingClientRect()
  const scaleX = rect.width  / (natW || 1)
  const scaleY = rect.height / (natH || 1)
  return {
    left:   `${sf.x * scaleX}px`,
    top:    `${sf.y * scaleY}px`,
    width:  `${(sf.rotated ? sf.height : sf.width)  * scaleX}px`,
    height: `${(sf.rotated ? sf.width  : sf.height) * scaleY}px`,
  }
})

// ---- Draw isolated sprite on canvas ----
const spriteCanvasRef = ref<HTMLCanvasElement | null>(null)

watch(selectedFrame, (sf) => {
  if (!sf || !atlasImgEl.value || !spriteCanvasRef.value) return
  drawSprite(sf)
})

function drawSprite(sf: SpriteFrame) {
  const canvas = spriteCanvasRef.value
  const img    = atlasImgEl.value
  if (!canvas || !img) return

  const sw = sf.sourceWidth  || sf.width
  const sh = sf.sourceHeight || sf.height
  canvas.width  = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, sw, sh)

  // Source region on atlas (dimensions swapped when rotated)
  const sx   = sf.x
  const sy   = sf.y
  const srcW = sf.rotated ? sf.height : sf.width   // atlas region width
  const srcH = sf.rotated ? sf.width  : sf.height  // atlas region height

  // Destination offset within the source frame
  const destX = sf.offsetX
  const destY = sf.offsetY

  if (sf.rotated) {
    // TexturePacker packs rotated sprites 90° CW. Undo with a 90° CCW rotation.
    // translate(destX + srcH, destY) places origin so that after rotate(-PI/2)
    // the drawn region maps exactly to (destX, destY, srcH, srcW) in screen space.
    ctx.save()
    ctx.translate(destX + srcH, destY)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, srcW, srcH)
    ctx.restore()
  } else {
    ctx.drawImage(img, sx, sy, srcW, srcH, destX, destY, srcW, srcH)
  }
}

function onAtlasLoad() {
  if (selectedFrame.value) drawSprite(selectedFrame.value)
}

function selectFrame(sf: SpriteFrame) {
  selectedFrame.value = sf
}

function formatSize(w: number, h: number) {
  return `${w}×${h}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'atlas'"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 90vw; height: 90vh; max-width: 1200px;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
              <span class="tag-atlas">图集</span>
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span v-if="atlasData" class="text-xs text-gray-500">
                {{ atlasData.frames.length }} 个 Sprite
                <template v-if="atlasData.imageWidth">
                  · {{ atlasData.imageWidth }}×{{ atlasData.imageHeight }}
                </template>
              </span>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <!-- Loading / Error -->
          <div v-if="loading" class="flex-1 flex items-center justify-center">
            <div class="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 text-sm">
            ⚠ {{ error }}
          </div>

          <!-- Main content: atlas left + sprite list right -->
          <div v-else-if="atlasData" class="flex flex-1 min-h-0 overflow-hidden">

            <!-- Left: atlas image with highlight -->
            <div class="flex-1 relative overflow-auto bg-gray-950 flex items-start justify-center p-4"
              style="background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 16px 16px;"
            >
              <div class="relative inline-block">
                <img
                  v-if="atlasImgUrl"
                  ref="atlasImgEl"
                  :src="atlasImgUrl"
                  alt="Atlas"
                  class="max-w-none block"
                  style="image-rendering: pixelated; max-width: 100%; max-height: 100%;"
                  @load="onAtlasLoad"
                />
                <!-- Selection highlight -->
                <div
                  v-if="selectedFrame && highlightStyle"
                  class="absolute border-2 border-yellow-400 pointer-events-none"
                  :style="highlightStyle"
                />
              </div>
            </div>

            <!-- Right: sprite list -->
            <div class="w-64 flex-shrink-0 flex flex-col border-l border-gray-700 bg-gray-850">
              <!-- Search in sprites -->
              <div class="p-2 border-b border-gray-700">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="搜索 Sprite..."
                  class="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1 focus:outline-none focus:border-yellow-500"
                />
              </div>

              <!-- Selected sprite preview -->
              <div
                v-if="selectedFrame"
                class="p-2 border-b border-gray-700 flex flex-col items-center gap-1"
              >
                <canvas
                  ref="spriteCanvasRef"
                  class="max-w-full max-h-24 object-contain"
                  style="image-rendering: pixelated; background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 8px 8px;"
                />
                <p class="text-xs text-gray-300 text-center truncate w-full">{{ selectedFrame.name }}</p>
                <p class="text-xs text-gray-500">
                  {{ formatSize(selectedFrame.sourceWidth || selectedFrame.width, selectedFrame.sourceHeight || selectedFrame.height) }}
                  <span v-if="selectedFrame.rotated" class="text-yellow-500 ml-1">旋转</span>
                </p>
              </div>

              <!-- Sprite list -->
              <div class="flex-1 overflow-y-auto">
                <div
                  v-for="sf in filteredFrames"
                  :key="sf.name"
                  class="px-3 py-1.5 cursor-pointer text-xs hover:bg-white/5 flex items-center justify-between"
                  :class="selectedFrame?.name === sf.name ? 'bg-yellow-500/10 text-yellow-300' : 'text-gray-400'"
                  @click="selectFrame(sf)"
                >
                  <span class="truncate flex-1 mr-2">{{ sf.name }}</span>
                  <span class="text-gray-600 flex-shrink-0">{{ sf.width }}×{{ sf.height }}</span>
                </div>
                <div v-if="filteredFrames.length === 0" class="text-center text-gray-600 text-xs py-4">
                  无匹配结果
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.bg-gray-850 { background: #1a2030; }
</style>
