<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { usePreviewStore } from '@/stores/previewStore'
import { createObjectURL } from '@/core/fileReader'

const preview = usePreviewStore()

const audioSrc  = ref<string | null>(null)
const audioRef  = ref<HTMLAudioElement | null>(null)
const playing   = ref(false)
const loop      = ref(false)
const volume    = ref(1)
const currentTime = ref(0)
const duration  = ref(0)
let blobUrl: string | null = null

watch(
  () => preview.asset,
  async (asset) => {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
    audioSrc.value = null
    playing.value = false
    currentTime.value = 0
    duration.value = 0
    if (!asset || asset.type !== 'audio') return
    try {
      blobUrl = await createObjectURL(asset.mainFile)
      audioSrc.value = blobUrl
    } catch (e) {
      console.error('Audio load error', e)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (blobUrl) URL.revokeObjectURL(blobUrl)
})

function togglePlay() {
  if (!audioRef.value) return
  if (playing.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

function onTimeUpdate() {
  currentTime.value = audioRef.value?.currentTime ?? 0
}
function onLoadedMeta() {
  duration.value = audioRef.value?.duration ?? 0
}
function onEnded() {
  playing.value = false
}
function onPlay() { playing.value = true }
function onPause() { playing.value = false }

function seek(e: Event) {
  const input = e.target as HTMLInputElement
  if (audioRef.value) {
    audioRef.value.currentTime = parseFloat(input.value)
  }
}

function setVolume(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  volume.value = val
  if (audioRef.value) audioRef.value.volume = val
}

function toggleLoop() {
  loop.value = !loop.value
  if (audioRef.value) audioRef.value.loop = loop.value
}

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div
        v-if="preview.visible && preview.asset?.type === 'audio'"
        class="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 shadow-2xl"
      >
        <div class="max-w-3xl mx-auto px-6 py-4">
          <!-- Title -->
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-sm font-medium text-gray-200">{{ preview.asset?.name }}</p>
              <p class="text-xs text-gray-500">{{ preview.asset?.mainFile.name }}</p>
            </div>
            <button class="btn-ghost" @click="preview.close">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <!-- Controls row -->
          <div class="flex items-center gap-4">
            <!-- Play/pause -->
            <button
              class="w-10 h-10 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center flex-shrink-0"
              @click="togglePlay"
            >
              <svg v-if="!playing" class="w-5 h-5 text-white ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>

            <!-- Time + progress -->
            <span class="text-xs text-gray-400 w-10 flex-shrink-0">{{ formatTime(currentTime) }}</span>
            <input
              type="range"
              class="flex-1 accent-green-500"
              :min="0"
              :max="duration || 100"
              :value="currentTime"
              step="0.1"
              @input="seek"
            />
            <span class="text-xs text-gray-400 w-10 flex-shrink-0">{{ formatTime(duration) }}</span>

            <!-- Loop -->
            <button
              class="text-sm px-2 py-1 rounded"
              :class="loop ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'"
              @click="toggleLoop"
              title="循环播放"
            >⟳</button>

            <!-- Volume -->
            <input
              type="range"
              class="w-20 accent-green-500"
              min="0" max="1" step="0.05"
              :value="volume"
              @input="setVolume"
            />
          </div>

          <!-- Hidden audio element -->
          <audio
            ref="audioRef"
            :src="audioSrc ?? undefined"
            :loop="loop"
            preload="metadata"
            class="hidden"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onLoadedMeta"
            @ended="onEnded"
            @play="onPlay"
            @pause="onPause"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); }
</style>
