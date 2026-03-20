<script setup lang="ts">
import { ref } from 'vue'
import { useAssetStore } from '@/stores/assetStore'
import {
  supportsFileSystemAccessAPI,
  openDirectoryPicker,
  fromFileList,
  saveHistory,
  loadHistory,
} from '@/core/fileReader'
import { scanEntries } from '@/core/scanner'

const store = useAssetStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const history = ref(loadHistory())

async function pickFolder() {
  if (supportsFileSystemAccessAPI()) {
    await pickViaFSAPI()
  } else {
    fileInputRef.value?.click()
  }
}

async function pickViaFSAPI() {
  try {
    store.reset()
    store.scanStatus = 'scanning'
    const { handle, entries } = await openDirectoryPicker(
      (count) => store.setScanProgress(count, count)
    )
    const rootPath = handle.name
    saveHistory(rootPath)
    history.value = loadHistory()
    await runScan(entries, rootPath)
  } catch (e: any) {
    if (e?.name === 'AbortError') return  // user cancelled picker
    store.setScanError(String(e?.message ?? e))
  }
}

async function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  const entries = fromFileList(input.files)
  const rootPath = input.files[0].webkitRelativePath.split('/')[0] || 'folder'
  saveHistory(rootPath)
  history.value = loadHistory()
  store.reset()
  store.scanStatus = 'scanning'
  await runScan(entries, rootPath)
  // reset input so same folder can be re-selected
  input.value = ''
}

async function runScan(entries: ReturnType<typeof fromFileList>, rootPath: string) {
  try {
    const result = await scanEntries(entries, rootPath, {
      onProgress: (s, t) => store.setScanProgress(s, t),
    })
    store.setScanResult(result)
  } catch (e: any) {
    store.setScanError(String(e?.message ?? e))
  }
}

const progressPercent = () =>
  store.scanTotal > 0 ? Math.round((store.scanProgress / store.scanTotal) * 100) : 0
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Primary button -->
    <button
      class="btn-primary flex items-center gap-1.5"
      :disabled="store.scanStatus === 'scanning'"
      @click="pickFolder"
    >
      <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>
      <span>选择文件夹</span>
    </button>

    <!-- Fallback file input -->
    <input
      ref="fileInputRef"
      type="file"
      webkitdirectory
      multiple
      class="hidden"
      @change="handleFileInput"
    />

    <!-- Scanning progress -->
    <div v-if="store.scanStatus === 'scanning'" class="flex items-center gap-2 text-sm text-gray-400">
      <div class="w-32 h-1.5 bg-gray-700 rounded overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-all duration-150"
          :style="{ width: `${progressPercent()}%` }"
        />
      </div>
      <span>{{ store.scanProgress.toLocaleString() }} 文件</span>
    </div>

    <!-- Scan error -->
    <div v-if="store.scanStatus === 'error'" class="text-sm text-red-400">
      ⚠ {{ store.scanError }}
    </div>
  </div>
</template>
