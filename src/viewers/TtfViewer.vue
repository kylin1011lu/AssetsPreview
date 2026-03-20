<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsArrayBuffer } from '@/core/fileReader'

const preview = usePreviewStore()

const loading   = ref(false)
const error     = ref('')
const fontName  = ref('')
const fontSize  = ref(36)
const fileSize  = ref(0)

const SAMPLE_TEXTS = [
  { label: '英文', text: 'The quick brown fox jumps over the lazy dog' },
  { label: '数字', text: '0 1 2 3 4 5 6 7 8 9' },
  { label: '中文', text: '永字八法 游戏开发 字体预览' },
  { label: '特殊', text: '! @ # $ % ^ & * ( ) + - = [ ] { }' },
]
const FONT_SIZES = [12, 16, 24, 36, 48, 72]

const UNIQUE_FAMILY = `__gav_ttf_${Date.now()}`
let currentFont: FontFace | null = null

watch(
  () => preview.asset,
  async (asset) => {
    // Unload previous font
    if (currentFont) {
      try { document.fonts.delete(currentFont) } catch {}
      currentFont = null
    }
    fontName.value = ''
    error.value    = ''

    if (!asset || asset.type !== 'ttf') return
    loading.value = true
    fileSize.value = asset.totalSize
    try {
      const buf = await readFileAsArrayBuffer(asset.mainFile)
      const familyName = `${UNIQUE_FAMILY}_${asset.id}`
      const ff = new FontFace(familyName, buf)
      await ff.load()
      document.fonts.add(ff)
      currentFont  = ff
      fontName.value = familyName
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (currentFont) {
    try { document.fonts.delete(currentFont) } catch {}
  }
})

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
        v-if="preview.visible && preview.asset?.type === 'ttf'"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 700px; max-width: 92vw; max-height: 90vh;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
              <span class="tag-font">字体</span>
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span class="text-xs text-gray-500">{{ formatSize(fileSize) }}</span>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <!-- Font size selector -->
          <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <span class="text-xs text-gray-500">字号：</span>
            <button
              v-for="sz in FONT_SIZES"
              :key="sz"
              class="btn text-xs px-2 py-0.5"
              :class="fontSize === sz ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'"
              @click="fontSize = sz"
            >{{ sz }}</button>
          </div>

          <!-- Loading / Error -->
          <div v-if="loading" class="flex-1 flex items-center justify-center py-12">
            <div class="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 text-sm py-12">
            ⚠ {{ error }}
          </div>

          <!-- Sample text -->
          <div v-else class="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-6">
            <div v-for="sample in SAMPLE_TEXTS" :key="sample.label">
              <div class="text-xs text-gray-600 mb-1">{{ sample.label }}</div>
              <div
                :style="{
                  fontFamily: fontName || 'sans-serif',
                  fontSize: `${fontSize}px`,
                  lineHeight: '1.4',
                  color: '#e5e7eb',
                  wordBreak: 'break-all',
                }"
              >{{ sample.text }}</div>
            </div>

            <!-- Custom text -->
            <div>
              <div class="text-xs text-gray-600 mb-1">自定义</div>
              <textarea
                class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-gray-200 text-sm resize-none focus:outline-none focus:border-purple-500"
                rows="2"
                placeholder="输入自定义文本..."
                :style="{ fontFamily: fontName || 'sans-serif', fontSize: `${fontSize}px` }"
              />
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
