<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, readFileAsBlob } from '@/core/fileReader'
import { loadScript, blobToDataUrl } from '@/utils/scriptLoader'
import type { SpineInfo } from '@/types'
import { SpinePlayer } from '@esotericsoftware/spine-player'

const preview = usePreviewStore()

// ---- State ----
const loading      = ref(false)
const error        = ref('')
const versionWarn  = ref('')
const spineInfo    = ref<SpineInfo | null>(null)
const animations   = ref<string[]>([])
const skins        = ref<string[]>([])
const currentAnim  = ref('')
const currentSkin  = ref('default')
const isPlaying    = ref(true)
const playSpeed    = ref(1)
const bgColor      = ref('#1a1a2e')
const pmaEnabled   = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)

let playerInstance: any = null

// Stored config so the player can be rebuilt when PMA is toggled
let savedPlayerConfig: {
  majorVer:    number
  jsonName:    string
  atlasName:   string
  animList:    string[]
  skinList:    string[]
  rawDataURIs: Record<string, string>
} | null = null

// ---- Spine 3.x runtime (loaded on demand via CDN / vendor) ----
// Build files are in spine-ts/build/ on the 3.8 branch, not spine-ts/player/build/
// jsDelivr / raw.githubusercontent.com serve JS as text/plain so we must use
// fetch-as-blob to bypass browser strict MIME type checking on <script> tags.
const SPINE3_JS_VENDOR = '/vendor/spine-player-3.8.js'
const SPINE3_JS_CDNS = [
  'https://cdn.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/build/spine-player.js',
  'https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8/spine-ts/build/spine-player.js',
]
const SPINE3_CSS_CDN = 'https://cdn.jsdelivr.net/gh/EsotericSoftware/spine-runtimes@3.8/spine-ts/player/css/spine-player.css'
let spine3CssInjected = false

/** Fetch a script as text, re-wrap in a blob with correct MIME type, then inject.
 *  This bypasses browser MIME-type blocking when CDNs serve .js as text/plain.
 *  Throws if the response is HTML (e.g. Vite SPA fallback for missing vendor file). */
async function fetchAndExecScript(url: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // Vite dev server returns index.html (Content-Type: text/html, 200) for unknown paths.
  // CDNs may also return an HTML error page. Reject anything that isn't JavaScript.
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html')) throw new Error(`Got HTML instead of JS from ${url}`)
  const code = await res.text()
  if (code.trimStart().startsWith('<')) throw new Error(`Response looks like HTML from ${url}`)
  const blob = new Blob([code], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    await loadScript(blobUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

async function ensureSpine3(): Promise<boolean> {
  // Already loaded?
  if ((window as any).spine?.SpinePlayer) return true

  if (!spine3CssInjected) {
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = SPINE3_CSS_CDN
    document.head.appendChild(link)
    spine3CssInjected = true
  }

  // Use fetchAndExecScript for ALL URLs so that a missing vendor file doesn't
  // produce a <script> 404 console error — fetch() fails silently via res.ok check.
  for (const url of [SPINE3_JS_VENDOR, ...SPINE3_JS_CDNS]) {
    try {
      await fetchAndExecScript(url)
      if ((window as any).spine?.SpinePlayer) return true
    } catch { /* try next */ }
  }
  return false
}

// ---- Main load ----
watch(
  [() => preview.asset, () => preview.openSerial],
  async ([asset]) => {
    destroyPlayer()
    error.value       = ''
    versionWarn.value = ''
    spineInfo.value   = null
    animations.value  = []
    skins.value       = []
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

      const [jsonText, atlasText] = await Promise.all([
        readFileAsText(jsonFile),
        readFileAsText(atlasFile),
      ])

      let skeJson: any
      try { skeJson = JSON.parse(jsonText) } catch {
        error.value = '无效的 JSON 骨骼文件'
        return
      }

      const version  = skeJson?.skeleton?.spine || '4.0.0'
      const majorVer = parseInt(version.split('.')[0] ?? '4')

      const animList = Object.keys(skeJson?.animations || {})
      const skinList = (skeJson?.skins || [])
        .map((s: any) => (typeof s === 'string' ? s : s.name))
        .filter(Boolean)
      if (!skinList.includes('default')) skinList.unshift('default')

      spineInfo.value   = { version, animationNames: animList, skinNames: skinList }
      animations.value  = animList
      skins.value       = skinList
      currentAnim.value = animList[0] || ''
      currentSkin.value = skinList[0] || 'default'

      // Use readFileAsBlob to support both FSAPI (handle) and webkitdirectory (file) modes
      const pngBlob    = await readFileAsBlob(pngFile)
      const pngDataUri = await blobToDataUrl(pngBlob)

      // First non-blank/non-comment line of atlas = texture filename referenced inside
      const textureName =
        atlasText.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#')) ||
        pngFile.name

      const rawDataURIs: Record<string, string> = {
        [jsonFile.name]:  `data:application/json;charset=utf-8,${encodeURIComponent(jsonText)}`,
        [atlasFile.name]: `data:text/plain;charset=utf-8,${encodeURIComponent(atlasText)}`,
        [textureName]:    pngDataUri,
      }
      if (textureName !== pngFile.name) rawDataURIs[pngFile.name] = pngDataUri

      // Wait for Vue to mount the container
      // Store config so we can rebuild when PMA is toggled
      savedPlayerConfig = {
        majorVer,
        jsonName:    jsonFile.name,
        atlasName:   atlasFile.name,
        animList,
        skinList,
        rawDataURIs,
      }

      await new Promise(r => setTimeout(r, 80))
      if (!containerRef.value) { error.value = '容器未挂载'; return }

      if (majorVer < 4) {
        const ok = await ensureSpine3()
        if (!ok) {
          error.value = '无法加载 Spine 3.x 运行时，请检查网络连接或将 spine-player-3.8.js 放入 public/vendor/ 目录'
          return
        }
      }

      await createSpinePlayer()
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// ---- Build / rebuild the Spine player (called on load and on PMA toggle) ----
async function createSpinePlayer() {
  const cfg = savedPlayerConfig
  if (!cfg || !containerRef.value) return
  destroyPlayer()
  // Give Vue / WebGL a tick to clean up the old canvas
  await new Promise(r => setTimeout(r, 30))
  if (!containerRef.value) return

  if (cfg.majorVer < 4) {
    const sp = (window as any).spine
    playerInstance = new sp.SpinePlayer(containerRef.value, {
      jsonUrl:            cfg.jsonName,
      atlasUrl:           cfg.atlasName,
      animation:          cfg.animList[0] || undefined,
      skin:               cfg.skinList[0] || 'default',
      rawDataURIs:        cfg.rawDataURIs,
      showControls:       false,
      alpha:              true,
      premultipliedAlpha: pmaEnabled.value,
      backgroundColor:    '#00000000',
      success: () => { isPlaying.value = true },
      error:   (_p: any, msg: string) => { error.value = msg || '加载失败' },
    })
  } else {
    playerInstance = new SpinePlayer(containerRef.value, {
      skeleton:              cfg.jsonName,
      atlas:                 cfg.atlasName,
      animation:             cfg.animList[0] || undefined,
      skin:                  cfg.skinList[0] || 'default',
      rawDataURIs:           cfg.rawDataURIs,
      showControls:          false,
      alpha:                 true,
      premultipliedAlpha:    pmaEnabled.value,
      backgroundColor:       '00000000',
      preserveDrawingBuffer: false,
      success: () => { isPlaying.value = true },
      error:   (_p: any, msg: string) => { error.value = msg || '加载失败' },
    })
  }
}

watch(pmaEnabled, async () => {
  if (savedPlayerConfig) await createSpinePlayer()
})

// ---- Controls ----
function playAnim(name: string) {
  currentAnim.value = name
  try { playerInstance?.setAnimation?.(name, true) } catch {}
  try { playerInstance?.play?.() } catch {}
}

function setSkin(name: string) {
  currentSkin.value = name
  // 4.x API
  try {
    playerInstance?.skeleton?.setSkinByName?.(name)
    playerInstance?.skeleton?.setSlotsToSetupPose?.()
  } catch {}
  // 3.x API fallback (player exposes setSkin directly)
  try { playerInstance?.setSkin?.(name) } catch {}
}

function togglePlay() {
  if (!playerInstance) return
  if (isPlaying.value) {
    try { playerInstance.pause() } catch {}
    isPlaying.value = false
  } else {
    try { playerInstance.play() } catch {}
    isPlaying.value = true
  }
}

function setSpeed(s: number) {
  playSpeed.value = s
  if (playerInstance) {
    // 4.x: speed is a property; 3.x: setSpeed() may be a method
    try { playerInstance.speed = s } catch {}
    try { playerInstance.setSpeed?.(s) } catch {}
  }
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

          <!-- Version warning bar -->
          <div v-if="versionWarn" class="px-4 py-2 text-xs text-orange-400 bg-orange-900/20 border-b border-orange-800/30 flex-shrink-0">
            ⚠ {{ versionWarn }}
          </div>

          <!-- Error bar -->
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

              <!-- Premultiplied Alpha -->
              <div class="p-3 border-b border-gray-700">
                <button
                  class="w-full text-xs px-2 py-1.5 rounded flex items-center gap-2 transition-colors"
                  :class="pmaEnabled
                    ? 'bg-green-700/40 text-green-300 border border-green-700/60'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'"
                  @click="pmaEnabled = !pmaEnabled"
                >
                  <span class="text-base leading-none" :class="pmaEnabled ? 'opacity-100' : 'opacity-40'">α</span>
                  预乘 Alpha
                  <span class="ml-auto text-xs" :class="pmaEnabled ? 'text-green-400' : 'text-gray-600'">{{ pmaEnabled ? 'ON' : 'OFF' }}</span>
                </button>
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
