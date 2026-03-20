<script setup lang="ts">
import { computed, ref } from 'vue'
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

const sidebarOpen = ref(true)
const thumbSize   = ref<80 | 120 | 180>(120)
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden">

    <!-- ═══════════ TOP BAR ═══════════ -->
    <header class="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 z-10">
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
        class="text-xs text-gray-500 truncate max-w-xs flex-shrink-0"
      >{{ store.rootDirName }}</div>

      <div class="flex-1" />

      <!-- Folder picker -->
      <FolderPicker />

      <!-- Sidebar toggle -->
      <button class="btn-ghost" @click="sidebarOpen = !sidebarOpen">
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </header>

    <!-- ═══════════ BODY ═══════════ -->
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- Left sidebar: directory tree -->
      <Transition name="sidebar">
        <aside
          v-if="sidebarOpen"
          class="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden"
        >
          <DirTree class="flex-1" />
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
