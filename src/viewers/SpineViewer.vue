<script setup lang="ts">
/**
 * SpineViewer.vue
 *
 * Renders Spine skeletal animations using spine-player (loaded dynamically).
 *
 * Version detection: reads json.skeleton.spine → picks matching runtime.
 *
 * Asset loading strategy:
 *   All asset data (JSON, atlas, PNG) is converted to base64 data URIs and
 *   passed via spine-player's rawDataURIs option so no server fetch is needed.
 *
 * Runtime loading order (per version):
 *   1. /vendor/spine-player-{major}.{minor}.js  (local offline vendor)
 *   2. EsotericSoftware CDN (online)
 */
import { ref, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText } from '@/core/fileReader'
import { loadScript, blobToDataUrl } from '@/utils/scriptLoader'
import type { SpineInfo } from '@/types'

const preview = usePreviewStore()

// ---- State ----
const loading        = ref(false)
const error          = ref('')
const spineInfo      = ref<SpineInfo | null>(null)
const animations     = ref<string[]>([])
const skins          = ref<string[]>([])
const currentAnim    = ref('')
const currentSkin    = ref('default')
const isPlaying      = ref(true)
const playSpeed      = ref(1)
const bgColor        = ref('#1a1a2e')
const containerRef   = ref<HTMLDivElement | null>(null)

let playerInstance: any = null
let cssLinked = false

// ---- Runtime URLs ----
function getRuntimeUrls(versionStr: string): string[] {
  const [major = '3', minor = '8'] = versionStr.split('.')
  const majorN = parseInt(major)
  const minorN = parseInt(minor)

  // Local vendor files (offline first)
  const localFile = `/vendor/spine-player-${majorN}.${minorN}.js`

  if (majorN >= 4) {
    return [
      localFile,
      `https://esotericsoftware.com/files/spine-player/4.1/spine-player.min.js`,
    ]
  } else if (minorN >= 8) {
    return [
      localFile,
      `https://esotericsoftware.com/files/spine-player/3.8/spine-player.min.js`,
    ]
  } else if (minorN >= 6) {
    return [
      localFile,
      `/vendor/spine-player-3.8.js`,
      `https://esotericsoftware.com/files/spine-player/3.6/spine-player.min.js`,
      `https://esotericsoftware.com/files/spine-player/3.8/spine-player.min.js`,
    ]
  } else {
    return [
      localFile,
      `https://esotericsoftware.com/files/spine-player/3.8/spine-player.min.js`,
    ]
  }
}

function getCssUrl(versionStr: string): string {
  const major = parseInt(versionStr.split('.')[0] ?? '3')
  const minor = parseInt(versionStr.split('.')[1] ?? '8')
  if (major >= 4) return `https://esotericsoftware.com/files/spine-player/4.1/spine-player.css`
  if (minor >= 8) return `https://esotericsoftware.com/files/spine-player/3.8/spine-player.css`
  return `https://esotericsoftware.com/files/spine-player/3.6/spine-player.css`
}

async function ensureRuntime(version: string): Promise<boolean> {
  const urls = getRuntimeUrls(version)

  // Inject CSS once
  if (!cssLinked) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = getCssUrl(version)
    document.head.appendChild(link)
    cssLinked = true
  }

  for (const url of urls) {
    try {
      await loadScript(url)
      if ((window as any).spine) return true
    } catch { /* try next */ }
  }
  return false
}

// ---- Main load ----
watch(
  () => preview.asset,
  async (asset) => {
    destroyPlayer()
    error.value     = ''
    spineInfo.value = null
    animations.value = []
    skins.value      = []
    currentAnim.value = ''
    currentSkin.value = 'default'

    if (!asset || asset.type !== 'spine') return

    loading.value = true
    try {
      const jsonFile  = asset.files.find(f => f.name.endsWith('.json'))
      const atlasFile = asset.files.find(f => f.name.endsWith('.atlas'))
      const pngFile   = asset.files.find(f => f.name.endsWith('.png'))

      if (!jsonFile || !atlasFile || !pngFile) {
        error.value = '缺少配对文件 (.json / .atlas / .png)'
        return
      }

      // Read inputs
      const [jsonText, atlasText] = await Promise.all([
        readFileAsText(jsonFile),
        readFileAsText(atlasFile),
      ])

      // Extract version from skeleton data
      let skeJson: any
      try { skeJson = JSON.parse(jsonText) } catch {
        error.value = '无效的 JSON 骨骼文件'
        return
      }

      const version = skeJson?.skeleton?.spine || '3.8.0'
      const animList = Object.keys(skeJson?.animations || {})
      const skinList = (skeJson?.skins || []).map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean)
      if (!skinList.includes('default')) skinList.unshift('default')

      spineInfo.value = { version, animationNames: animList, skinNames: skinList }
      animations.value = animList
      skins.value      = skinList
      currentAnim.value = animList[0] || ''
      currentSkin.value = skinList[0] || 'default'

      // Load runtime
      const ok = await ensureRuntime(version)
      if (!ok) {
        error.value = `无法加载 Spine ${version} 运行时。请将 spine-player 文件放入 public/vendor/ 目录。`
        return
      }

      // Convert PNG to data URI for rawDataURIs
      const pngDataUri = await blobToDataUrl(pngFile.file!)

      // Find the texture filename as referenced in the atlas
      const textureName = atlasText.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#'))
            || pngFile.name

      // Build rawDataURIs map
      const rawDataURIs: Record<string, string> = {}
      rawDataURIs[jsonFile.name]  = `data:application/json;charset=utf-8,${encodeURIComponent(jsonText)}`
      rawDataURIs[atlasFile.name] = `data:text/plain;charset=utf-8,${encodeURIComponent(atlasText)}`
      rawDataURIs[textureName]    = pngDataUri
      // Also map PNG by its filename in case it differs from atlas reference
      if (textureName !== pngFile.name) rawDataURIs[pngFile.name] = pngDataUri

      // Give Vue time to update DOM
      await new Promise(r => setTimeout(r, 80))

      if (!containerRef.value) { error.value = '容器未挂载'; return }

      const sp = (window as any).spine
      playerInstance = new sp.SpinePlayer(containerRef.value, {
        jsonUrl:       jsonFile.name,
        atlasUrl:      atlasFile.name,
        animation:     animList[0] || undefined,
        skin:          skinList[0] || 'default',
        backgroundColor: bgColor.value.replace('#', '#') + 'ff',
        rawDataURIs,
        showControls:  false,
        alpha:         true,
        preserveDrawingBuffer: false,
      })

      isPlaying.value = true
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// ---- Controls ----
function playAnim(name: string) {
  currentAnim.value = name
  try { playerInstance?.setAnimation?.(name) } catch {}
}

function setSkin(name: string) {
  currentSkin.value = name
  try { playerInstance?.setSkin?.(name) } catch {}
}

function togglePlay() {
  if (!playerInstance) return
  try {
    if (isPlaying.value) {
      playerInstance.pause?.()
    } else {
      playerInstance.play?.()
    }
    isPlaying.value = !isPlaying.value
  } catch {}
}

function setSpeed(s: number) {
  playSpeed.value = s
  try { playerInstance?.setSpeed?.(s) } catch {}
}

// ---- Cleanup ----
function destroyPlayer() {
  try { playerInstance?.dispose?.() } catch {}
  playerInstance = null
}
onUnmounted(destroyPlayer)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'spine'"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div
          class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 92vw; height: 92vh; max-width: 1100px;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-2">
              <span class="tag-spine">Spine</span>
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span v-if="spineInfo" class="text-xs text-gray-500">v{{ spineInfo.version }}</span>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <!-- Warning / error bar -->
          <div v-if="error && !loading" class="px-4 py-2 text-xs text-yellow-400 bg-yellow-900/20 border-b border-yellow-800/30 flex-shrink-0">
            ⚠ {{ error }}
          </div>

          <!-- Body -->
          <div class="flex flex-1 min-h-0 overflow-hidden">

            <!-- Spine player canvas area -->
            <div class="flex-1 relative overflow-hidden" :style="{ background: bgColor }">
              <div v-if="loading" class="absolute inset-0 flex items-center justify-center z-10">
                <div class="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <div ref="containerRef" class="w-full h-full" />
            </div>

            <!-- Right panel -->
            <div class="w-52 flex-shrink-0 flex flex-col border-l border-gray-700 bg-gray-850 overflow-y-auto">

              <!-- Animations -->
              <div class="p-3 border-b border-gray-700">
                <p class="text-xs text-gray-500 mb-2">动画列表</p>
                <div class="flex flex-col gap-0.5">
                  <button
                    v-for="anim in animations"
                    :key="anim"
                    class="text-xs text-left px-2 py-1 rounded truncate"
                    :class="currentAnim === anim ? 'bg-green-700/40 text-green-200' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'"
                    @click="playAnim(anim)"
                  >{{ anim }}</button>
                  <p v-if="animations.length === 0" class="text-xs text-gray-600">无动画</p>
                </div>
              </div>

              <!-- Skins -->
              <div v-if="skins.length > 1" class="p-3 border-b border-gray-700">
                <p class="text-xs text-gray-500 mb-2">皮肤</p>
                <div class="flex flex-col gap-0.5">
                  <button
                    v-for="skin in skins"
                    :key="skin"
                    class="text-xs text-left px-2 py-1 rounded truncate"
                    :class="currentSkin === skin ? 'bg-green-700/40 text-green-200' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'"
                    @click="setSkin(skin)"
                  >{{ skin }}</button>
                </div>
              </div>

              <!-- Controls -->
              <div class="p-3 border-b border-gray-700 flex flex-col gap-2">
                <p class="text-xs text-gray-500">控制</p>
                <button class="btn-ghost text-xs" @click="togglePlay">
                  {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
                </button>
                <div>
                  <p class="text-xs text-gray-600 mb-1">速度 {{ playSpeed }}x</p>
                  <div class="flex gap-1 flex-wrap">
                    <button v-for="s in [0.25, 0.5, 1, 2]" :key="s"
                      class="text-xs px-2 py-0.5 rounded"
                      :class="playSpeed === s ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'"
                      @click="setSpeed(s)"
                    >{{ s }}x</button>
                  </div>
                </div>
              </div>

              <!-- Background -->
              <div class="p-3">
                <p class="text-xs text-gray-500 mb-2">背景色</p>
                <div class="flex gap-2 flex-wrap">
                  <button v-for="c in ['#1a1a2e', '#ffffff', '#000000', '#808080']" :key="c"
                    class="w-6 h-6 rounded border"
                    :class="bgColor === c ? 'border-green-400' : 'border-gray-600'"
                    :style="{ background: c }"
                    @click="bgColor = c"
                  />
                  <input type="color" v-model="bgColor" class="w-6 h-6 rounded border border-gray-600 cursor-pointer bg-transparent" />
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
