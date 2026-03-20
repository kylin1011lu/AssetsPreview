<script setup lang="ts">
/**
 * DragonBonesViewer.vue
 *
 * Renders DragonBones 5.x skeletal animations using PixiJS 7 +
 * a dynamically loaded DragonBones Pixi runtime.
 *
 * Runtime loading order:
 *   1. /vendor/dragonbones-pixi.js  (local, offline-friendly)
 *   2. CDN fallback (online only)
 */
import { ref, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, createObjectURL } from '@/core/fileReader'
import type { DragonBonesInfo } from '@/types'
import * as PIXI from 'pixi.js'
import { PixiFactory } from '@md5crypt/dragonbones-pixi'

const preview = usePreviewStore()

// ---- Runtime state ----
const loading       = ref(false)
const error         = ref('')
const runtimeReady  = ref(false)
const dbInfo        = ref<DragonBonesInfo | null>(null)
const animations    = ref<string[]>([])
const currentAnim   = ref('')
const bgColor       = ref('#1a1a2e')
const playSpeed     = ref(1)
const isPlaying     = ref(true)
const canvasRef     = ref<HTMLDivElement | null>(null)

let pixiApp:    PIXI.Application | null = null
let armDisplay: any = null
let viewport:   PIXI.Container | null = null
let cleanupEvents: (() => void) | null = null
let objectUrls: string[] = []

// ---- Main load ----
watch(
  [() => preview.asset, () => preview.openSerial],
  async ([asset]) => {
    destroyPixi()
    error.value   = ''
    dbInfo.value  = null
    animations.value = []
    currentAnim.value = ''
    if (!asset || asset.type !== 'dragonbones') return

    loading.value = true
    runtimeReady.value = true
    try {
      const skeFile  = asset.files.find(f => f.name.endsWith('_ske.json'))
      const texJFile = asset.files.find(f => f.name.endsWith('_tex.json'))
      const texPFile = asset.files.find(f => f.name.endsWith('_tex.png'))

      if (!skeFile || !texJFile || !texPFile) {
        error.value = '缺少配对文件 (_ske.json / _tex.json / _tex.png)'
        return
      }

      const [skeText, texText] = await Promise.all([
        readFileAsText(skeFile),
        readFileAsText(texJFile),
      ])
      const texPngUrl = await createObjectURL(texPFile)
      objectUrls.push(texPngUrl)

      const skeJson  = JSON.parse(skeText)
      const texJson  = JSON.parse(texText)

      // Version check
      const ver = skeJson.version || skeJson.dbVersion || ''
      if (ver && !ver.startsWith('5.')) {
        error.value = `⚠ 版本警告：数据版本为 ${ver}，预期 5.x。动画可能无法正常播放。`
        // Continue anyway
      }

      // Build info
      const armatureName = skeJson.armature?.[0]?.name || asset.name
      const animList: string[] = skeJson.armature?.[0]?.animation?.map((a: any) => a.name) || []
      const frameRate = skeJson.armature?.[0]?.frameRate || skeJson.frameRate || 24

      dbInfo.value = {
        version: ver,
        name: armatureName,
        armatureNames: skeJson.armature?.map((a: any) => a.name) || [armatureName],
        animationNames: animList,
        frameRate,
      }
      animations.value = animList
      currentAnim.value = animList[0] || ''

      // Wait for canvas container to mount before creating PixiJS app
      await new Promise(r => setTimeout(r, 50))
      await initPixi(skeJson, texJson, texPngUrl, armatureName, animList[0])
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

async function initPixi(
  skeJson: unknown,
  texJson: unknown,
  texPngUrl: string,
  armatureName: string,
  animName?: string,
) {
  if (!canvasRef.value) return

  const w = canvasRef.value.clientWidth  || 600
  const h = canvasRef.value.clientHeight || 500

  pixiApp = new PIXI.Application({
    width: w,
    height: h,
    backgroundColor: parseInt(bgColor.value.replace('#', '0x')),
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  canvasRef.value.appendChild(pixiApp.view as HTMLCanvasElement)

  // Load texture via Texture.fromURL — bypasses Assets parser detection (blob URLs have no extension)
  const texture = await PIXI.Texture.fromURL(texPngUrl)

  const factory = PixiFactory.factory
  factory.parseDragonBonesData(skeJson)
  factory.parseTextureAtlasData(texJson, texture)

  armDisplay = factory.buildArmatureDisplay(armatureName)
  if (!armDisplay) { error.value = '无法创建 Armature'; return }

  // Auto-fit and center using local bounds
  armDisplay.x = 0
  armDisplay.y = 0
  armDisplay.scale.set(1)
  const lb = armDisplay.getLocalBounds()
  const bw = lb.width  || w * 0.8
  const bh = lb.height || h * 0.8
  const fitScale = Math.min((w * 0.85) / bw, (h * 0.85) / bh, 2)
  armDisplay.scale.set(fitScale)
  if (lb.width > 0 && lb.height > 0) {
    armDisplay.x = w / 2 - (lb.x + bw / 2) * fitScale
    armDisplay.y = h / 2 - (lb.y + bh / 2) * fitScale
  } else {
    armDisplay.x = w / 2
    armDisplay.y = h / 2
  }

  viewport = new PIXI.Container()
  viewport.addChild(armDisplay)
  pixiApp.stage.addChild(viewport)

  if (animName) {
    armDisplay.animation.play(animName)
  }

  isPlaying.value = true
  pixiApp.ticker.add(() => {
    PixiFactory.advanceTime(pixiApp!.ticker.deltaMS / 1000 * playSpeed.value)
  })

  // Drag & zoom
  const canvas = pixiApp.view as HTMLCanvasElement
  canvas.style.cursor = 'grab'
  let dragging = false
  let dragLast = { x: 0, y: 0 }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const cur = viewport!.scale.x
    const next = Math.min(10, Math.max(0.05, cur * factor))
    viewport!.x = mx + (viewport!.x - mx) * (next / cur)
    viewport!.y = my + (viewport!.y - my) * (next / cur)
    viewport!.scale.set(next)
  }
  const onDown = (e: MouseEvent) => {
    dragging = true
    dragLast = { x: e.clientX, y: e.clientY }
    canvas.style.cursor = 'grabbing'
  }
  const onMove = (e: MouseEvent) => {
    if (!dragging) return
    viewport!.x += e.clientX - dragLast.x
    viewport!.y += e.clientY - dragLast.y
    dragLast = { x: e.clientX, y: e.clientY }
  }
  const onUp = () => { dragging = false; canvas.style.cursor = 'grab' }
  const onDblClick = () => { viewport!.x = 0; viewport!.y = 0; viewport!.scale.set(1) }

  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  canvas.addEventListener('dblclick', onDblClick)

  cleanupEvents = () => {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    canvas.removeEventListener('dblclick', onDblClick)
  }
}

// ---- Controls ----
function playAnim(name: string) {
  currentAnim.value = name
  armDisplay?.animation?.play(name)
  isPlaying.value = true
}

function togglePlay() {
  if (!armDisplay) return
  if (isPlaying.value) {
    armDisplay.animation.timeScale = 0
    isPlaying.value = false
  } else {
    armDisplay.animation.timeScale = playSpeed.value
    isPlaying.value = true
  }
}

function setSpeed(s: number) {
  playSpeed.value = s
  if (armDisplay) armDisplay.animation.timeScale = isPlaying.value ? s : 0
}

watch(bgColor, (c) => {
  if (pixiApp) pixiApp.renderer.background.color = parseInt(c.replace('#', '0x'))
})

// ---- Cleanup ----
function destroyPixi() {
  cleanupEvents?.(); cleanupEvents = null; viewport = null
  if (armDisplay) {
    try {
      PixiFactory.factory.clear(true)
    } catch {}
    armDisplay = null
  }
  if (pixiApp) {
    try { pixiApp.destroy(true, { children: true }) } catch {}
    pixiApp = null
  }
  objectUrls.forEach(u => URL.revokeObjectURL(u))
  objectUrls = []
}
onUnmounted(destroyPixi)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'dragonbones'"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="preview.close"
      >
        <div class="relative flex flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
          style="width: 92vw; height: 92vh; max-width: 1100px;"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-2">
              <span class="tag-dragonbones">DragonBones</span>
              <span class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</span>
              <span v-if="dbInfo" class="text-xs text-gray-500">
                v{{ dbInfo.version }} · {{ dbInfo.frameRate }}fps
              </span>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <!-- Error -->
          <div v-if="error && !loading" class="px-4 py-2 text-xs text-yellow-400 bg-yellow-900/20 border-b border-yellow-800/30 flex-shrink-0">
            ⚠ {{ error }}
          </div>

          <!-- Body: canvas + controls -->
          <div class="flex flex-1 min-h-0 overflow-hidden">

            <!-- Canvas area -->
            <div class="flex-1 relative overflow-hidden">
              <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
                <div class="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <div
                ref="canvasRef"
                class="w-full h-full"
                :style="{ background: bgColor }"
              />
              <div class="absolute bottom-2 right-2 text-xs text-gray-600 pointer-events-none select-none">拖拽移动 · 滚轮缩放 · 双击重置</div>
            </div>

            <!-- Right panel: controls -->
            <div class="w-52 flex-shrink-0 flex flex-col border-l border-gray-700 bg-gray-850 overflow-y-auto">

              <!-- Animation list -->
              <div class="p-3 border-b border-gray-700">
                <p class="text-xs text-gray-500 mb-2">动画列表</p>
                <div class="flex flex-col gap-0.5">
                  <button
                    v-for="anim in animations"
                    :key="anim"
                    class="text-xs text-left px-2 py-1 rounded truncate"
                    :class="currentAnim === anim ? 'bg-orange-600/40 text-orange-200' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'"
                    @click="playAnim(anim)"
                  >{{ anim }}</button>
                  <p v-if="animations.length === 0" class="text-xs text-gray-600">无动画</p>
                </div>
              </div>

              <!-- Play controls -->
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
                      :class="playSpeed === s ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'"
                      @click="setSpeed(s)"
                    >{{ s }}x</button>
                  </div>
                </div>
              </div>

              <!-- Background color -->
              <div class="p-3">
                <p class="text-xs text-gray-500 mb-2">背景色</p>
                <div class="flex gap-2 flex-wrap">
                  <button v-for="c in ['#1a1a2e', '#ffffff', '#000000', '#808080']" :key="c"
                    class="w-6 h-6 rounded border"
                    :class="bgColor === c ? 'border-orange-400' : 'border-gray-600'"
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
