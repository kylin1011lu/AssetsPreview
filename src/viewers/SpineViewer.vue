<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { readFileAsText, readFileAsArrayBuffer, createObjectURL } from '@/core/fileReader'
import type { SpineInfo } from '@/types'
import * as PIXI from 'pixi.js'
import { TextureAtlas } from '@pixi-spine/base'
import { Spine, detectSpineVersion, SPINE_VERSION } from '@pixi-spine/loader-uni'
import * as rt37 from '@pixi-spine/runtime-3.7'
import * as rt38 from '@pixi-spine/runtime-3.8'
import * as rt41 from '@pixi-spine/runtime-4.1'

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

let pixiApp: PIXI.Application | null = null
let spineObj: any = null
let viewport: PIXI.Container | null = null
let cleanupEvents: (() => void) | null = null
let objectUrls: string[] = []

let savedRawData: {
  skeJson?: any            // JSON format
  skelBuffer?: ArrayBuffer // binary .skel format
  isBinary: boolean
  atlasText: string
  pngBlobUrls: Record<string, string>
  animList: string[]
  skinList: string[]
  version: string
  verEnum: SPINE_VERSION
} | null = null

// Read the version string out of a .skel binary header (hash string, then version string).
// Spine stores strings as: varint(actualLen+1), then bytes (0 = null)
function readVersionFromSkelBinary(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer)
    let offset = 0
    function readVarInt(): number {
      let result = 0, shift = 0, b: number
      do { b = bytes[offset++]; result |= (b & 0x7F) << shift; shift += 7 } while (b & 0x80)
      return result
    }
    function skipString() { const n = readVarInt(); if (n > 0) offset += n - 1 }
    function readString(): string {
      const n = readVarInt()
      if (n === 0) return ''
      const s = new TextDecoder().decode(new Uint8Array(buffer, offset, n - 1))
      offset += n - 1
      return s
    }
    skipString() // hash
    return readString() // version
  } catch { return '4.0.0' }
}

function getRuntime(ver: SPINE_VERSION) {
  switch (ver) {
    case SPINE_VERSION.VER37:
      return rt37
    case SPINE_VERSION.VER38:
      return rt38
    case SPINE_VERSION.VER40:
    case SPINE_VERSION.VER41:
      return rt41
    default:
      return null
  }
}

// ---- Build the Spine scene from raw data ----
async function buildSpineScene() {
  const data = savedRawData
  if (!data || !containerRef.value) return

  cleanupEvents?.(); cleanupEvents = null; viewport = null
  if (spineObj) { try { spineObj.destroy() } catch {} spineObj = null }
  if (pixiApp) { try { pixiApp.destroy(true, { children: true }) } catch {} pixiApp = null }

  const cw = containerRef.value.clientWidth  || 600
  const ch = containerRef.value.clientHeight || 500

  pixiApp = new PIXI.Application({
    width: cw,
    height: ch,
    backgroundColor: parseInt(bgColor.value.replace('#', '0x')),
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  containerRef.value.appendChild(pixiApp.view as HTMLCanvasElement)

  const atlas = await new Promise<TextureAtlas>((resolve) => {
    new TextureAtlas(data.atlasText,
      (pageName: string, loaderFn: (tex: PIXI.BaseTexture) => void) => {
        const blobUrl = data.pngBlobUrls[pageName]
        if (!blobUrl) return
        const baseTex = PIXI.BaseTexture.from(blobUrl, {
          alphaMode: pmaEnabled.value ? PIXI.ALPHA_MODES.PREMULTIPLIED_ALPHA : PIXI.ALPHA_MODES.UNPACK,
        })
        if (baseTex.valid) {
          loaderFn(baseTex)
        } else {
          baseTex.once('loaded', () => loaderFn(baseTex))
        }
      },
      (completedAtlas: TextureAtlas) => {
        resolve(completedAtlas)
      }
    )
  })

  const runtime = getRuntime(data.verEnum)
  if (!runtime) throw new Error(`不支持的 Spine 版本: ${data.version}`)

  const attachmentLoader = new (runtime as any).AtlasAttachmentLoader(atlas)
  let skeletonData: any
  if (data.isBinary) {
    const binaryParser = new (runtime as any).SkeletonBinary(attachmentLoader)
    binaryParser.scale = 1.0
    skeletonData = binaryParser.readSkeletonData(new Uint8Array(data.skelBuffer!))
    // Update metadata from parsed result (only available after parsing binary)
    const anims: string[] = skeletonData.animations.map((a: any) => a.name)
    const skinNames: string[] = skeletonData.skins.map((s: any) => s.name).filter(Boolean)
    if (skinNames.length === 0) skinNames.push('default')
    animations.value  = anims
    skins.value       = skinNames
    currentAnim.value = currentAnim.value || anims[0] || ''
    currentSkin.value = currentSkin.value || skinNames[0] || 'default'
    spineInfo.value   = { version: skeletonData.version || data.version, animationNames: anims, skinNames }
    data.animList = anims
    data.skinList = skinNames
  } else {
    const jsonParser = new (runtime as any).SkeletonJson(attachmentLoader)
    jsonParser.scale = 1.0
    skeletonData = jsonParser.readSkeletonData(data.skeJson)
  }

  spineObj = new Spine(skeletonData)
  spineObj.autoUpdate = true

  const bounds = spineObj.getLocalBounds()
  const bw = bounds.width || 1
  const bh = bounds.height || 1
  const fitScale = Math.min((cw * 0.85) / bw, (ch * 0.85) / bh, 2)
  spineObj.scale.set(fitScale)

  // Center: place bounds center at canvas center
  spineObj.x = cw / 2 - (bounds.x + bw / 2) * fitScale
  spineObj.y = ch / 2 - (bounds.y + bh / 2) * fitScale

  viewport = new PIXI.Container()
  viewport.addChild(spineObj)
  pixiApp.stage.addChild(viewport)

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

  const skinName = data.skinList[0] || 'default'
  try {
    spineObj.skeleton.setSkinByName(skinName)
    spineObj.skeleton.setSlotsToSetupPose()
  } catch {}

  if (data.animList.length > 0) {
    spineObj.state.setAnimation(0, data.animList[0], true)
  }

  spineObj.state.timeScale = playSpeed.value
  isPlaying.value = true
}

// ---- Main load ----
watch(
  [() => preview.asset, () => preview.openSerial],
  async ([asset]) => {
    destroyAll()
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
      const skelFile  = asset.files.find(f => f.name.endsWith('.skel'))
      const atlasFile = asset.files.find(f => f.name.endsWith('.atlas'))
      const pngFiles  = asset.files.filter(f => f.name.endsWith('.png'))
      const isBinary  = !jsonFile && !!skelFile
      const skelSource = jsonFile ?? skelFile

      if (!skelSource || !atlasFile || pngFiles.length === 0) {
        error.value = '缺少配对文件 (.json/.skel / .atlas / .png)'
        return
      }

      const atlasText = await readFileAsText(atlasFile)

      let skeJson: any
      let skelBuffer: ArrayBuffer | undefined
      let version: string
      let verEnum: SPINE_VERSION
      let animList: string[]
      let skinList: string[]

      if (isBinary) {
        skelBuffer = await readFileAsArrayBuffer(skelFile!)
        version    = readVersionFromSkelBinary(skelBuffer)
        verEnum    = detectSpineVersion(version)
        if (verEnum === SPINE_VERSION.UNKNOWN) {
          versionWarn.value = `未知 Spine 版本 ${version}，将尝试 4.1 运行时`
        }
        // animations/skins extracted after parsing in buildSpineScene
        animList = []
        skinList = []
      } else {
        const jsonText = await readFileAsText(jsonFile!)
        try { skeJson = JSON.parse(jsonText) } catch {
          error.value = '无效的 JSON 骨骼文件'
          return
        }
        version = skeJson?.skeleton?.spine || '4.0.0'
        verEnum = detectSpineVersion(version)
        if (verEnum === SPINE_VERSION.UNKNOWN) {
          versionWarn.value = `未知 Spine 版本 ${version}，将尝试 4.1 运行时`
        }
        animList = Object.keys(skeJson?.animations || {})
        const rawSkins = skeJson?.skins
        if (Array.isArray(rawSkins)) {
          skinList = rawSkins.map((s: any) => (typeof s === 'string' ? s : s.name)).filter(Boolean)
        } else if (rawSkins && typeof rawSkins === 'object') {
          skinList = Object.keys(rawSkins)
        } else {
          skinList = []
        }
        if (!skinList.includes('default')) skinList.unshift('default')
        spineInfo.value   = { version, animationNames: animList, skinNames: skinList }
        animations.value  = animList
        skins.value       = skinList
        currentAnim.value = animList[0] || ''
        currentSkin.value = skinList[0] || 'default'
      }

      const pngBlobUrls: Record<string, string> = {}
      for (const pf of pngFiles) {
        const url = await createObjectURL(pf)
        objectUrls.push(url)
        pngBlobUrls[pf.name] = url
      }

      savedRawData = { skeJson, skelBuffer, isBinary, atlasText, pngBlobUrls, animList, skinList, version, verEnum }

      await nextTick()
      await new Promise(r => setTimeout(r, 60))
      if (!containerRef.value) { error.value = '容器未挂载'; return }

      await buildSpineScene()
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// ---- PMA toggle -> rebuild scene ----
watch(pmaEnabled, async () => {
  if (!savedRawData || !containerRef.value) return
  PIXI.utils.clearTextureCache()
  try {
    await buildSpineScene()
  } catch (e: any) {
    error.value = e?.message || String(e)
  }
})

// ---- Controls ----
function playAnim(name: string) {
  currentAnim.value = name
  if (!spineObj) return
  try {
    spineObj.state.setAnimation(0, name, true)
    spineObj.state.timeScale = playSpeed.value
    isPlaying.value = true
  } catch {}
}

function setSkin(name: string) {
  currentSkin.value = name
  if (!spineObj) return
  try {
    spineObj.skeleton.setSkinByName(name)
    spineObj.skeleton.setSlotsToSetupPose()
  } catch {}
}

function togglePlay() {
  if (!spineObj) return
  if (isPlaying.value) {
    spineObj.state.timeScale = 0
    isPlaying.value = false
  } else {
    spineObj.state.timeScale = playSpeed.value
    isPlaying.value = true
  }
}

function setSpeed(s: number) {
  playSpeed.value = s
  if (spineObj && isPlaying.value) {
    spineObj.state.timeScale = s
  }
}

watch(bgColor, (c) => {
  if (pixiApp) pixiApp.renderer.background.color = parseInt(c.replace('#', '0x'))
})

// ---- Cleanup ----
function destroyAll() {
  cleanupEvents?.(); cleanupEvents = null; viewport = null
  if (spineObj) { try { spineObj.destroy() } catch {} spineObj = null }
  if (pixiApp) { try { pixiApp.destroy(true, { children: true }) } catch {} pixiApp = null }
  PIXI.utils.clearTextureCache()
  objectUrls.forEach(u => URL.revokeObjectURL(u))
  objectUrls = []
  savedRawData = null
}
onUnmounted(destroyAll)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="preview.visible && preview.asset?.type === 'spine' && !preview.forceImage"
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

            <!-- Spine canvas area -->
            <div class="flex-1 relative overflow-hidden" :style="{ background: bgColor }">
              <div v-if="loading" class="absolute inset-0 flex items-center justify-center z-10">
                <div class="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <div ref="containerRef" class="w-full h-full" />
              <div class="absolute bottom-2 right-2 text-xs text-gray-600 pointer-events-none select-none">拖拽移动 · 滚轮缩放 · 双击重置</div>
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
              <div class="p-3 border-b border-gray-700">
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
