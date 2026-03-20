<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, createObjectURL } from '@/core/fileReader'
import { parseFnt } from '@/core/parsers/fntParser'
import type { FntData } from '@/core/parsers/fntParser'

const preview = usePreviewStore()

// ---- State ----
const loading      = ref(false)
const error        = ref('')
const fntData      = ref<FntData | null>(null)
const textureUrl   = ref<string | null>(null)
const customText   = ref('')
const canvasRef    = ref<HTMLCanvasElement | null>(null)
const textureImgEl = ref<HTMLImageElement | null>(null)
let blobUrl: string | null = null

// ---- Load FNT ----
watch(
  () => preview.asset,
  async (asset) => {
    cleanup()
    fntData.value    = null
    textureUrl.value = null
    error.value      = ''
    customText.value = ''
    if (!asset || asset.type !== 'fnt') return
    loading.value = true
    try {
      const fntFile = asset.files.find(f => f.name.endsWith('.fnt'))
      if (!fntFile) throw new Error('找不到 .fnt 文件')
      const text = await readFileAsText(fntFile)
      const parsed = parseFnt(text)
      fntData.value = parsed

      // Build preview text from all chars defined in the fnt file
      // Sort: printable ASCII (32-126) first, then everything else by code point
      const codes = [...parsed.chars.keys()].filter(c => c > 0)
      codes.sort((a, b) => {
        const aAscii = a >= 32 && a <= 126
        const bAscii = b >= 32 && b <= 126
        if (aAscii !== bAscii) return aAscii ? -1 : 1
        return a - b
      })
      customText.value = codes.map(c => String.fromCodePoint(c)).join('')

      // Find texture png
      const pngFile = asset.files.find(f =>
        f.name === parsed.pageFile ||
        f.name.endsWith('.png')
      )
      if (pngFile) {
        blobUrl = await createObjectURL(pngFile)
        textureUrl.value = blobUrl
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

// ---- Render text on canvas ----
function renderText() {
  const canvas = canvasRef.value
  const img    = textureImgEl.value
  const fnt    = fntData.value
  if (!canvas || !img || !fnt || !img.complete || img.naturalWidth === 0) return

  const text = customText.value
  const scale = 1
  const padding = 8

  // Calculate canvas dimensions from actual character extents
  let totalW = 0
  let maxBottom = 0
  let minTop = Infinity
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const c = fnt.chars.get(code)
    if (c && c.width > 0) {
      const top    = c.yoffset * scale
      const bottom = top + c.height * scale
      if (top < minTop)    minTop = top
      if (bottom > maxBottom) maxBottom = bottom
      totalW += c.xadvance * scale
    } else {
      totalW += (fnt.chars.get(32)?.xadvance ?? 8) * scale
    }
  }
  if (minTop === Infinity) minTop = 0
  // Shift all draws down if any char has negative yoffset
  const yShift = minTop < 0 ? -minTop : 0
  const contentH = maxBottom + yShift

  canvas.width  = Math.max(totalW + padding * 2, 100)
  canvas.height = Math.max(contentH + padding * 2, fnt.lineHeight * scale + padding * 2)

  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  let x = padding
  const y = padding + yShift
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const c = fnt.chars.get(code)
    if (!c || c.width === 0) {
      // Space or unknown
      x += (fnt.chars.get(32)?.xadvance ?? 8) * scale
      continue
    }
    ctx.drawImage(
      img,
      c.x, c.y, c.width, c.height,
      x + c.xoffset * scale,
      y + c.yoffset * scale,
      c.width * scale,
      c.height * scale,
    )
    x += c.xadvance * scale
  }
}

function onTextureLoad() {
  nextTick(renderText)
}

watch(customText, () => nextTick(renderText))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'fnt' && !preview.forceImage"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 720px; max-width: 92vw; max-height: 90vh;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
              <span class="tag-font">位图字体</span>
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span v-if="fntData" class="text-xs text-gray-500">
                {{ fntData.face }} · {{ fntData.size }}px · {{ fntData.chars.size }} 字符
              </span>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <div v-if="loading" class="flex-1 flex items-center justify-center py-12">
            <div class="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 text-sm py-12">
            ⚠ {{ error }}
          </div>

          <div v-else-if="fntData" class="overflow-y-auto flex-1 flex flex-col gap-4 p-4">
            <!-- Custom input -->
            <div>
              <p class="text-xs text-gray-500 mb-1">预览文本</p>
              <input
                v-model="customText"
                type="text"
                class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <!-- Rendered canvas -->
            <div>
              <p class="text-xs text-gray-500 mb-1">渲染效果</p>
              <div class="rounded overflow-auto bg-gray-950 p-2"
                style="background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 12px 12px;"
              >
                <canvas
                  ref="canvasRef"
                  style="image-rendering: pixelated; display: block;"
                />
              </div>
            </div>

            <!-- Texture atlas -->
            <div v-if="textureUrl">
              <p class="text-xs text-gray-500 mb-1">纹理图集 ({{ fntData.scaleW }}×{{ fntData.scaleH }})</p>
              <div class="rounded overflow-auto max-h-56"
                style="background-image: repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%); background-size: 12px 12px;"
              >
                <img
                  ref="textureImgEl"
                  :src="textureUrl"
                  alt="FNT texture"
                  style="image-rendering: pixelated; max-width: 100%; display: block;"
                  @load="onTextureLoad"
                />
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
