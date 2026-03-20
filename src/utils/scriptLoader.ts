/**
 * scriptLoader.ts — Dynamic script injection with caching
 */
const loaded = new Map<string, Promise<void>>()

export function loadScript(url: string): Promise<void> {
  if (loaded.has(url)) return loaded.get(url)!

  const p = new Promise<void>((resolve, reject) => {
    // Check if script tag is already in DOM
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.crossOrigin = 'anonymous'
    script.onload  = () => resolve()
    script.onerror = () => reject(new Error(`无法加载脚本: ${url}`))
    document.head.appendChild(script)
  })

  loaded.set(url, p)
  return p
}

/**
 * Convert a Blob/File to a base-64 data URL.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
