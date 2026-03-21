<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useAssetStore } from '@/stores/assetStore'
import { usePreviewStore } from '@/stores/previewStore'
import FolderPicker from '@/components/FolderPicker.vue'
import DirTree from '@/components/DirTree.vue'
import AssetGrid from '@/components/AssetGrid.vue'
import SearchBar from '@/components/SearchBar.vue'
import TypeFilter from '@/components/TypeFilter.vue'
import AssetStats from '@/components/AssetStats.vue'
import ImageViewer from '@/viewers/ImageViewer.vue'
import AudioViewer from '@/viewers/AudioViewer.vue'
import PlistViewer from '@/viewers/PlistViewer.vue'
import TtfViewer from '@/viewers/TtfViewer.vue'
import FntViewer from '@/viewers/FntViewer.vue'
import DragonBonesViewer from '@/viewers/DragonBonesViewer.vue'
import SpineViewer from '@/viewers/SpineViewer.vue'

const store   = useAssetStore()
const preview = usePreviewStore()

const sidebarOpen  = ref(true)
const thumbSize    = ref<80 | 120 | 180>(120)
const sidebarWidth = ref(224) // px

// ---- Root path prefix editor ----
const editingPrefix  = ref(false)
const prefixDraft    = ref('')
function startEditPrefix() {
  prefixDraft.value = store.rootPrefix
  editingPrefix.value = true
  // Focus input after render
  nextTick(() => (document.getElementById('prefix-input') as HTMLInputElement | null)?.focus())
}
function commitPrefix() {
  store.setRootPrefix(prefixDraft.value)
  editingPrefix.value = false
}
function cancelPrefix() { editingPrefix.value = false }

let resizing = false
let resizeStartX = 0
let resizeStartW = 0

function onResizerDown(e: MouseEvent) {
  resizing = true
  resizeStartX = e.clientX
  resizeStartW = sidebarWidth.value
  document.addEventListener('mousemove', onResizerMove)
  document.addEventListener('mouseup', onResizerUp)
  e.preventDefault()
}
function onResizerMove(e: MouseEvent) {
  if (!resizing) return
  const next = resizeStartW + (e.clientX - resizeStartX)
  sidebarWidth.value = Math.min(480, Math.max(120, next))
}
function onResizerUp() {
  resizing = false
  document.removeEventListener('mousemove', onResizerMove)
  document.removeEventListener('mouseup', onResizerUp)
}
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden">

    <!-- ═══════════ TOP BAR ═══════════ -->
    <header class="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 z-10">
      <!-- Sidebar toggle (leftmost, next to sidebar edge) -->
      <button class="btn-ghost flex-shrink-0" @click="sidebarOpen = !sidebarOpen">
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
        </svg>
      </button>

      <!-- Logo + name -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <svg class="w-6 h-6 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
        </svg>
        <span class="font-semibold text-sm">GameAssetViewer</span>
      </div>

      <!-- Current path indicator -->
      <div
        v-if="store.rootDirName"
        class="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 max-w-xs"
      >
        <!-- Prefix part (clickable to edit) -->
        <template v-if="!editingPrefix">
          <span class="truncate max-w-[180px]" :title="store.rootPrefix || '未设置路径前缀'">
            <span v-if="store.rootPrefix" class="text-gray-500">…/{{ store.rootPrefix.split(/[\/\\]/).slice(-1)[0] }}/</span>
            <span class="text-gray-300 font-medium">{{ store.rootDirName }}</span>
          </span>
          <button
            class="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors px-0.5"
            :title="store.rootPrefix ? '修改路径前缀（父目录绝对路径）' : '设置路径前缀，以显示完整硬盘路径'"
            @click="startEditPrefix"
          >
            <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
            </svg>
          </button>
        </template>
        <!-- Inline editor -->
        <template v-else>
          <input
            id="prefix-input"
            v-model="prefixDraft"
            type="text"
            placeholder="/Users/you/projects/my-game"
            class="bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-xs text-gray-200 w-56 focus:outline-none"
            @keydown.enter="commitPrefix"
            @keydown.escape="cancelPrefix"
          />
          <button class="text-xs text-blue-400 hover:text-blue-300 px-1" @click="commitPrefix">确定</button>
          <button class="text-xs text-gray-500 hover:text-gray-300 px-1" @click="cancelPrefix">取消</button>
        </template>
      </div>

      <div class="flex-1" />

      <!-- Folder picker -->
      <FolderPicker />
    </header>

    <!-- ═══════════ BODY ═══════════ -->
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- Left sidebar: directory tree -->
      <Transition name="sidebar">
        <aside
          v-if="sidebarOpen"
          class="flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden relative"
          :style="{ width: sidebarWidth + 'px' }"
        >
          <DirTree class="flex-1" />
          <!-- Resize handle -->
          <div
            class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors z-10"
            @mousedown="onResizerDown"
          />
        </aside>
      </Transition>

      <!-- Main content area -->
      <main class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Toolbar: search + filter + stats + view options -->
        <div class="flex flex-col gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0 bg-gray-900/60">
          <div class="flex items-center gap-2">
            <SearchBar class="flex-1 max-w-sm" />
            <div class="flex items-center gap-1 ml-auto">
              <!-- Sort controls -->
              <div class="flex items-center gap-0.5 mr-2 border border-gray-700 rounded overflow-hidden">
                <button
                  v-for="f in ([['name','名称'],['size','大小'],['mtime','时间']] as const)"
                  :key="f[0]"
                  class="text-xs px-2 py-1 transition-colors"
                  :class="store.filter.sortField === f[0]
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'"
                  @click="store.setSort(f[0])"
                >
                  {{ f[1] }}
                  <span v-if="store.filter.sortField === f[0]">
                    {{ store.filter.sortOrder === 'asc' ? '↑' : '↓' }}
                  </span>
                </button>
              </div>

              <!-- Thumb size -->
              <button
                v-for="sz in [80, 120, 180] as const"
                :key="sz"
                class="btn-ghost text-xs"
                :class="thumbSize === sz ? 'text-blue-400' : ''"
                @click="thumbSize = sz"
              >
                {{ sz === 80 ? 'S' : sz === 120 ? 'M' : 'L' }}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-4 justify-between">
            <TypeFilter />
            <AssetStats />
          </div>
        </div>

        <!-- Welcome / empty state -->
        <div
          v-if="store.scanStatus === 'idle'"
          class="flex-1 flex flex-col items-center justify-center gap-4 text-center"
        >
          <svg class="w-16 h-16 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
          </svg>
          <div>
            <p class="text-lg font-semibold text-gray-400">游戏资源预览工具</p>
            <p class="text-sm text-gray-600 mt-1">点击右上角「选择文件夹」开始</p>
          </div>
        </div>

        <!-- Scanning indicator -->
        <div
          v-else-if="store.scanStatus === 'scanning'"
          class="flex-1 flex flex-col items-center justify-center gap-3"
        >
          <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p class="text-sm text-gray-400">扫描中… {{ store.scanProgress.toLocaleString() }} 个文件</p>
        </div>

        <!-- Asset grid -->
        <AssetGrid
          v-else-if="store.scanStatus === 'done'"
          :assets="store.filteredAssets"
          :thumb-size="thumbSize"
          class="flex-1 min-h-0"
        />

        <!-- Error state -->
        <div v-else-if="store.scanStatus === 'error'" class="flex-1 flex items-center justify-center">
          <div class="text-red-400 text-sm text-center">
            <p class="text-lg mb-1">⚠ 扫描失败</p>
            <p class="text-gray-500">{{ store.scanError }}</p>
          </div>
        </div>
      </main>
    </div>

    <!-- ═══════════ VIEWERS ═══════════ -->
    <ImageViewer />
    <AudioViewer />
    <PlistViewer />
    <TtfViewer />
    <FntViewer />
    <DragonBonesViewer />
    <SpineViewer />
  </div>
</template>

<style>
/* Global dark theme base */
html { color-scheme: dark; }
body { margin: 0; background: #030712; }
* { box-sizing: border-box; }
</style>

<style scoped>
.sidebar-enter-active, .sidebar-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.sidebar-enter-from, .sidebar-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
