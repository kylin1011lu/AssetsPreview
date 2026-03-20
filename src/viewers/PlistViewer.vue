<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, createObjectURL } from '@/core/fileReader'
import { parsePlist } from '@/core/parsers/plistParser'
import type { SpriteFrame, AtlasData } from '@/types'
import JSZip from 'jszip'

const preview = usePreviewStore()

// ---- State ----
const loading        = ref(false)
const error          = ref('')
const atlasData      = ref<AtlasData | null>(null)
const atlasImgUrl    = ref<string | null>(null)
const atlasImgEl     = ref<HTMLImageElement | null>(null)  // for click-detection only
const selectedFrame  = ref<SpriteFrame | null>(null)
const searchQuery    = ref('')
const zoomLevel      = ref(1)
const bgColor        = ref('#1a1a2e')
const downloadingAll = ref(false)
const downloadProgress = ref(0)
let blobUrl: string | null = null
// Separate Image object used for all canvas drawing — guaranteed loaded
let atlasImg: HTMLImageElement | null = null

// ---- Load atlas ----
watch(
  () => preview.asset,
  async (asset) => {
    cleanup()
    if (!asset || asset.type !== 'atlas') return
    loading.value = true
    error.value   = ''
    atlasData.value     = null
    atlasImgUrl.value   = null
    atlasImg            = null
    selectedFrame.value = null
    searchQuery.value   = ''
    zoomLevel.value     = 1
    try {
      const plistFile = asset.files.find(f => f.name.endsWith('.plist'))
      const pngFile   = asset.files.find(f => f.name.endsWith('.png'))
      if (!plistFile) throw new Error('找不到 .plist 文件')
      const text = await readFileAsText(plistFile)
      atlasData.value = parsePlist(text, pngFile?.name || 'texture.png')
      if (pngFile) {
        blobUrl = await createObjectURL(pngFile)
        atlasImgUrl.value = blobUrl
        // Load a dedicated Image for canvas drawing
        const img = new Image()
        img.onload = () => {
          atlasImg = img
          // Re-draw preview if a frame was selected before image loaded
          if (selectedFrame.value) drawPreview(selectedFrame.value)
        }
        img.src = blobUrl
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
  atlasImg = null
}
onUnmounted(cleanup)

// ---- Filtered frames ----
const filteredFrames = computed(() => {
  if (!atlasData.value) return []
  const q = searchQuery.value.toLowerCase().trim()
  return q
    ? atlasData.value.frames.filter(f => f.name.toLowerCase().includes(q))
    : atlasData.value.frames
})

// ---- Core sprite extraction — mirrors TextureSplit exactly ----
// textureRect in plist stores atlas-region size (w/h may be swapped when sprite is rotated CW)
// spriteSize (= sf.width × sf.height) = natural sprite pixel dimensions
// spriteSourceSize (= sf.sourceWidth × sf.sourceHeight) = original un-trimmed size
// spriteOffset (sf.offsetX/Y) = center-based offset, Y-up convention
function extractSpriteCanvas(sf: SpriteFrame, img: HTMLImageElement): HTMLCanvasElement {
  // Step 1 — cut the atlas region (swap w/h back if stored rotated)
  const atlasW = sf.rotated ? sf.height : sf.width
  const atlasH = sf.rotated ? sf.width  : sf.height
  const tmp = document.createElement('canvas')
  tmp.width  = atlasW
  tmp.height = atlasH
  tmp.getContext('2d')!.drawImage(img, sf.x, sf.y, atlasW, atlasH, 0, 0, atlasW, atlasH)

  // Step 2 — undo CW 90° rotation (→ CCW 90°) to restore natural orientation
  const rotated = document.createElement('canvas')
  rotated.width  = sf.width   // natural sprite width
  rotated.height = sf.height  // natural sprite height
  const rCtx = rotated.getContext('2d')!
  if (sf.rotated) {
    rCtx.translate(0, sf.height)
    rCtx.rotate(-Math.PI / 2)
  }
  rCtx.drawImage(tmp, 0, 0)

  // Step 3 — place sprite in source-size canvas with center-based offset (Y-up → Y-down)
  const result = document.createElement('canvas')
  result.width  = sf.sourceWidth  || sf.width
  result.height = sf.sourceHeight || sf.height
  const offsetX = (result.width  - sf.width)  / 2 + sf.offsetX
  const offsetY = (result.height - sf.height) / 2 - sf.offsetY
  result.getContext('2d')!.drawImage(rotated, offsetX, offsetY)
  return result
}

// ---- Preview canvas ----
const spriteCanvas = ref<HTMLCanvasElement | null>(null)

watch(selectedFrame, (sf) => {
  if (!sf || !atlasImg) return
  // nextTick ensures v-if="selectedFrame" has mounted the <canvas> before we draw
  nextTick(() => drawPreview(sf))
})

function drawPreview(sf: SpriteFrame) {
  const canvas = spriteCanvas.value
  if (!canvas || !atlasImg) return
  const sprite = extractSpriteCanvas(sf, atlasImg)
  canvas.width  = sprite.width
  canvas.height = sprite.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(sprite, 0, 0)
}

watch(bgColor, () => { if (selectedFrame.value) drawPreview(selectedFrame.value) })

// ---- Atlas selection highlight ----
// The highlight div is inside a container whose pixel dimensions = naturalSize * zoomLevel.
// So coordinates must also be multiplied by zoomLevel.
const highlightStyle = computed(() => {
  const sf = selectedFrame.value
  if (!sf) return null
  const rW = sf.rotated ? sf.height : sf.width
  const rH = sf.rotated ? sf.width  : sf.height
  const z  = zoomLevel.value
  return {
    left:   `${sf.x * z}px`,
    top:    `${sf.y * z}px`,
    width:  `${rW  * z}px`,
    height: `${rH  * z}px`,
  }
})

// ---- Click on atlas to select sprite ----
function onAtlasClick(e: MouseEvent) {
  if (!atlasImgEl.value || !atlasData.value) return
  const rect   = atlasImgEl.value.getBoundingClientRect()
  const scaleX = (atlasData.value.imageWidth  || atlasImgEl.value.naturalWidth)  / rect.width
  const scaleY = (atlasData.value.imageHeight || atlasImgEl.value.naturalHeight) / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top)  * scaleY
  for (const sf of atlasData.value.frames) {
    const rW = sf.rotated ? sf.height : sf.width
    const rH = sf.rotated ? sf.width  : sf.height
    if (x >= sf.x && x <= sf.x + rW && y >= sf.y && y <= sf.y + rH) {
      selectFrame(sf)
      break
    }
  }
}

// ---- Zoom ----
function doZoom(factor: number, reset = false) {
  zoomLevel.value = reset ? 1 : Math.max(0.25, Math.min(5, zoomLevel.value * factor))
}

// ---- Select ----
function selectFrame(sf: SpriteFrame) {
  selectedFrame.value = sf
}

// ---- Download single sprite ----
function downloadSprite(sf: SpriteFrame) {
  if (!atlasImg) return
  const canvas = extractSpriteCanvas(sf, atlasImg)
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = sf.name + '.png'; a.click()
    URL.revokeObjectURL(url)
  })
}

// ---- Download all as ZIP ----
async function downloadAll() {
  if (!atlasData.value || !atlasImg) return
  downloadingAll.value  = true
  downloadProgress.value = 0
  try {
    const zip     = new JSZip()
    const sprites = atlasData.value.frames
    for (let i = 0; i < sprites.length; i++) {
      const sf     = sprites[i]
      const canvas = extractSpriteCanvas(sf, atlasImg)
      const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!)))
      zip.file(sf.name + '.png', blob)
      downloadProgress.value = Math.round((i + 1) / sprites.length * 100)
    }
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a'); a.href = url
    a.download = (preview.asset?.name || 'sprites') + '.zip'; a.click()
    URL.revokeObjectURL(url)
  } finally {
    downloadingAll.value  = false
    downloadProgress.value = 0
  }
}

function formatSize(w: number, h: number) { return `${w}×${h}` }
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'atlas' && !preview.forceImage"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div
          class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 92vw; height: 92vh; max-width: 1400px;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="tag-atlas flex-shrink-0">图集</span>
              <span class="text-sm font-medium text-gray-200 truncate">{{ preview.asset?.name }}</span>
              <span v-if="atlasData" class="text-xs text-gray-500 flex-shrink-0">
                {{ atlasData.frames.length }} 帧
                <template v-if="atlasData.imageWidth">
                  · {{ atlasData.imageWidth }}×{{ atlasData.imageHeight }}
                </template>
              </span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <!-- Download All -->
              <button
                v-if="atlasData && atlasImgUrl"
                class="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 border border-yellow-700/40 transition-colors disabled:opacity-50"
                :disabled="downloadingAll"
                @click="downloadAll"
              >
                <svg v-if="!downloadingAll" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ downloadingAll ? `${downloadProgress}%` : '导出全部 ZIP' }}
              </button>
              <button class="btn-ghost" @click="preview.close">
                <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Loading / Error -->
          <div v-if="loading" class="flex-1 flex items-center justify-center">
            <div class="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 text-sm px-4">⚠ {{ error }}</div>

          <!-- Main: atlas left | right panel -->
          <div v-else-if="atlasData" class="flex flex-1 min-h-0 overflow-hidden">

            <!-- ─── Left: Atlas view ─── -->
            <div class="flex-1 flex flex-col min-w-0 border-r border-gray-700">
              <!-- Zoom toolbar -->
              <div class="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700 bg-gray-800/60 flex-shrink-0">
                <button class="btn-ghost p-1" title="放大" @click="doZoom(1.25)">
                  <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button class="btn-ghost p-1" title="缩小" @click="doZoom(0.8)">
                  <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <button class="btn-ghost p-1 text-xs leading-none px-2" @click="doZoom(1, true)">重置</button>
                <span class="text-xs text-gray-500 ml-1">{{ Math.round(zoomLevel * 100) }}%</span>
              </div>

              <!-- Scrollable atlas area -->
              <div
                class="flex-1 overflow-auto"
                style="background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 16px 16px;"
              >
                <div class="p-4" style="display: inline-block;">
                  <!-- Size this div to the actual zoomed pixel dimensions so the scrollbar is correct -->
                  <div
                    ref="atlasWrapRef"
                    class="relative cursor-crosshair"
                    style="outline: 1px solid rgba(255,255,255,0.2); outline-offset: 0px;"
                    :style="{
                      width:  `${(atlasData.imageWidth  || 0) * zoomLevel}px`,
                      height: `${(atlasData.imageHeight || 0) * zoomLevel}px`,
                    }"
                    @click="onAtlasClick"
                  >
                    <img
                      v-if="atlasImgUrl"
                      ref="atlasImgEl"
                      :src="atlasImgUrl"
                      alt="Atlas texture"
                      class="block"
                      style="width: 100%; height: 100%; image-rendering: pixelated;"
                    />
                    <!-- Selection highlight: coords are in zoomed pixels -->
                    <div
                      v-if="selectedFrame && highlightStyle"
                      class="absolute border-2 border-yellow-400 pointer-events-none"
                      style="box-shadow: 0 0 0 1px rgba(0,0,0,0.5);"
                      :style="highlightStyle"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- ─── Right panel ─── -->
            <div class="w-72 flex-shrink-0 flex flex-col bg-gray-900">

              <!-- Sprite preview -->
              <div class="border-b border-gray-700 flex-shrink-0">
                <div
                  v-if="selectedFrame"
                  class="p-3 flex flex-col items-center gap-2"
                >
                  <!-- bg color picker + label -->
                  <div class="flex items-center justify-between w-full">
                    <span class="text-xs text-gray-400 truncate flex-1 mr-2">{{ selectedFrame.name }}</span>
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs text-gray-600">背景</span>
                      <input
                        v-model="bgColor"
                        type="color"
                        class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        title="预览背景色"
                      />
                    </div>
                  </div>

                  <!-- Canvas preview: fit inside 240×240, preserve aspect ratio -->
                  <div class="rounded overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style="width: 240px; height: 240px;">
                    <canvas
                      ref="spriteCanvas"
                      class="block"
                      style="image-rendering: pixelated; max-width: 240px; max-height: 240px;"
                    />
                  </div>

                  <!-- Info table -->
                  <table class="w-full text-xs">
                    <tbody class="divide-y divide-gray-800">
                      <tr>
                        <td class="py-0.5 pr-2 text-gray-500 w-16">尺寸</td>
                        <td class="py-0.5 text-gray-300">
                          {{ formatSize(selectedFrame.sourceWidth || selectedFrame.width, selectedFrame.sourceHeight || selectedFrame.height) }}
                        </td>
                      </tr>
                      <tr>
                        <td class="py-0.5 pr-2 text-gray-500">纹理区</td>
                        <td class="py-0.5 text-gray-300">
                          ({{ selectedFrame.x }}, {{ selectedFrame.y }})
                          {{ formatSize(selectedFrame.rotated ? selectedFrame.height : selectedFrame.width, selectedFrame.rotated ? selectedFrame.width : selectedFrame.height) }}
                        </td>
                      </tr>
                      <tr v-if="selectedFrame.offsetX || selectedFrame.offsetY">
                        <td class="py-0.5 pr-2 text-gray-500">偏移</td>
                        <td class="py-0.5 text-gray-300">({{ selectedFrame.offsetX }}, {{ selectedFrame.offsetY }})</td>
                      </tr>
                      <tr>
                        <td class="py-0.5 pr-2 text-gray-500">旋转</td>
                        <td class="py-0.5" :class="selectedFrame.rotated ? 'text-yellow-400' : 'text-gray-500'">
                          {{ selectedFrame.rotated ? '是 (90°CW)' : '否' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <!-- Download single -->
                  <button
                    class="w-full flex items-center justify-center gap-1.5 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                    @click="downloadSprite(selectedFrame)"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                    下载此 Sprite
                  </button>
                </div>

                <!-- Empty state -->
                <div v-else class="py-6 flex flex-col items-center gap-2 text-gray-600">
                  <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
                  </svg>
                  <span class="text-xs">点击 Sprite 查看详情</span>
                </div>
              </div>

              <!-- Search -->
              <div class="p-2 border-b border-gray-700 flex-shrink-0">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="搜索 Sprite 名称..."
                  class="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 px-2 py-1.5 focus:outline-none focus:border-yellow-500 placeholder-gray-600"
                />
              </div>

              <!-- Sprite list -->
              <div class="flex-1 overflow-y-auto">
                <div
                  v-for="sf in filteredFrames"
                  :key="sf.name"
                  class="px-3 py-1.5 cursor-pointer text-xs flex items-center justify-between hover:bg-white/5 group"
                  :class="selectedFrame?.name === sf.name
                    ? 'bg-yellow-500/10 text-yellow-300 border-l-2 border-yellow-500'
                    : 'text-gray-400 border-l-2 border-transparent'"
                  @click="selectFrame(sf)"
                >
                  <span class="truncate flex-1 mr-2">{{ sf.name }}</span>
                  <span class="text-gray-600 flex-shrink-0">
                    {{ formatSize(sf.sourceWidth || sf.width, sf.sourceHeight || sf.height) }}
                  </span>
                </div>
                <div v-if="filteredFrames.length === 0" class="text-center text-gray-600 text-xs py-6">
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
</style>
