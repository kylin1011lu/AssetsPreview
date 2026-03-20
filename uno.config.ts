import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
  ],
  theme: {
    colors: {
      // Asset type colors
      image: '#3b82f6',    // blue
      audio: '#22c55e',    // green
      animation: '#f97316', // orange
      font: '#a855f7',     // purple
      atlas: '#eab308',    // yellow
      dragonbones: '#f97316',
      spine: '#ef4444',    // red
    },
  },
  shortcuts: {
    'btn': 'px-3 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors',
    'btn-primary': 'btn bg-blue-600 hover:bg-blue-500 text-white',
    'btn-ghost': 'btn bg-transparent hover:bg-white/10 text-gray-300',
    'card': 'rounded-lg border border-gray-700 bg-gray-800',
    'tag': 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
    'tag-image': 'tag bg-blue-500/20 text-blue-300',
    'tag-audio': 'tag bg-green-500/20 text-green-300',
    'tag-animation': 'tag bg-orange-500/20 text-orange-300',
    'tag-font': 'tag bg-purple-500/20 text-purple-300',
    'tag-atlas': 'tag bg-yellow-500/20 text-yellow-300',
    'tag-dragonbones': 'tag bg-orange-500/20 text-orange-300',
    'tag-spine': 'tag bg-red-500/20 text-red-300',
  },
})
